import type {
  AcceptedAgentUserMessage,
  AgentSessionControlResumeInput,
  AgentSessionControlSendInput,
  AgentSessionLiveRef,
  WorkspaceSession,
} from "@openducktor/contracts";
import { agentSessionRefKey } from "@openducktor/core";
import { Effect } from "effect";
import { buildWorkspaceSessionTitle } from "../../domain/workspace-sessions/workspace-session-title";
import {
  type HostError,
  HostOperationError,
  HostValidationError,
  isHostError,
} from "../../effect/host-errors";
import type { AgentSessionPersistencePort } from "../../ports/agent-session-persistence-port";
import type { TaskStoreError } from "../../ports/task-repository-ports";
import type { WorkspaceSessionStorePort } from "../../ports/workspace-session-store-port";
import type { WorkspaceSettingsService } from "./workspace-settings-model";
import {
  validateWorkspaceSessionTarget,
  type WorkspaceSessionTargetDependencies,
} from "./workspace-session-target";

export type WorkspaceSessionUpdatedPublisher = (
  workspaceId: string,
  session: WorkspaceSession,
) => Effect.Effect<void, HostError>;

const storeEffect = <A>(effect: Effect.Effect<A, TaskStoreError>): Effect.Effect<A, HostError> =>
  effect.pipe(
    Effect.mapError((cause) =>
      isHostError(cause)
        ? cause
        : new HostOperationError({
            operation: "workspaceSession.persist",
            message: cause.message,
            cause,
          }),
    ),
  );

export const createWorkspaceSessionRuntimePersistence = ({
  store,
  settings,
  git,
  publishUpdated,
}: {
  store: WorkspaceSessionStorePort;
  settings: Pick<WorkspaceSettingsService, "getRepoConfigByRepoPath">;
  git: WorkspaceSessionTargetDependencies["git"];
  publishUpdated: WorkspaceSessionUpdatedPublisher;
}): AgentSessionPersistencePort => {
  const pendingFinalMessages = new Map<string, { messageId: string; occurredAt: number }>();
  const find = (runtimeRef: AgentSessionLiveRef) =>
    Effect.gen(function* () {
      const config = yield* settings.getRepoConfigByRepoPath(runtimeRef.repoPath);
      const scope = { workspaceId: config.workspaceId, repoPath: runtimeRef.repoPath };
      const session = yield* storeEffect(
        store.findByRuntimeSession({
          ...scope,
          runtimeKind: runtimeRef.runtimeKind,
          externalSessionId: runtimeRef.externalSessionId,
        }),
      );
      if (!session) return null;
      if (session.executionTarget.workingDirectory !== runtimeRef.workingDirectory) {
        return yield* Effect.fail(
          new HostValidationError({
            message: `Runtime directory does not match Workspace Session ${session.id}: ${runtimeRef.workingDirectory}`,
            field: "workingDirectory",
          }),
        );
      }
      return { ref: { ...scope, sessionId: session.id }, session };
    });
  const requireActive = (session: WorkspaceSession) =>
    session.archivedAt === null
      ? Effect.void
      : Effect.fail(
          new HostValidationError({
            message: "Restore this Workspace Session before opening or changing it.",
            field: "sessionId",
          }),
        );
  const prepare = <Input extends AgentSessionControlResumeInput | AgentSessionControlSendInput>(
    input: Input,
  ): Effect.Effect<Input, HostError> =>
    Effect.gen(function* () {
      if (input.sessionScope.kind !== "repository") return input;
      const known = yield* find(input);
      if (!known) return input;
      yield* requireActive(known.session);
      yield* validateWorkspaceSessionTarget({ git }, input.repoPath, known.session.executionTarget);
      const prepared = {
        ...input,
        systemPrompt: known.session.roleSnapshot?.systemPrompt ?? "",
      };
      if (known.session.selectedModel !== null) prepared.model = known.session.selectedModel;
      return prepared;
    });
  const recordAcceptedMessage = (
    runtimeRef: AgentSessionLiveRef,
    message: AcceptedAgentUserMessage,
  ) =>
    Effect.gen(function* () {
      const known = yield* find(runtimeRef);
      if (!known) return;
      let { session } = known;
      const before = session;
      if (session.generatedTitle === null) {
        const generatedTitle = buildWorkspaceSessionTitle(message);
        if (generatedTitle !== null)
          session = yield* storeEffect(store.setGeneratedTitle({ ...known.ref, generatedTitle }));
      }
      const occurredAt = Date.parse(message.timestamp);
      if (occurredAt > session.updatedAt)
        session = yield* storeEffect(
          store.recordActivity({ ...known.ref, activity: { type: "user_message", occurredAt } }),
        );
      if (message.model) {
        if (
          message.model.runtimeKind !== undefined &&
          message.model.runtimeKind !== runtimeRef.runtimeKind
        )
          return yield* Effect.fail(
            new HostValidationError({
              message: "Accepted message model does not match its Runtime.",
              field: "model",
            }),
          );
        session = yield* storeEffect(
          store.setSelectedModel({
            ...known.ref,
            selectedModel: { ...message.model, runtimeKind: runtimeRef.runtimeKind },
          }),
        );
      }
      if (session !== before) yield* publishUpdated(known.ref.workspaceId, session);
    });
  const flushFinalMessage = (runtimeRef: AgentSessionLiveRef) =>
    Effect.gen(function* () {
      const key = agentSessionRefKey(runtimeRef);
      const pending = pendingFinalMessages.get(key);
      if (!pending) return;
      const known = yield* find(runtimeRef);
      if (known && pending.occurredAt > known.session.updatedAt) {
        const saved = yield* storeEffect(
          store.recordActivity({
            ...known.ref,
            activity: { type: "assistant_response", occurredAt: pending.occurredAt },
          }),
        );
        yield* publishUpdated(known.ref.workspaceId, saved);
      }
      pendingFinalMessages.delete(key);
    });
  const validateRef = (runtimeRef: AgentSessionLiveRef) =>
    Effect.gen(function* () {
      const known = yield* find(runtimeRef);
      if (!known) return;
      yield* requireActive(known.session);
      yield* validateWorkspaceSessionTarget(
        { git },
        runtimeRef.repoPath,
        known.session.executionTarget,
      );
    });
  return {
    prepareResume: prepare,
    prepareSend: prepare,
    validateRef,
    validateModelUpdate: (input) =>
      Effect.gen(function* () {
        const known = yield* find(input);
        if (!known) return;
        yield* requireActive(known.session);
        yield* validateWorkspaceSessionTarget(
          { git },
          input.repoPath,
          known.session.executionTarget,
        );
        if (input.model === null)
          return yield* Effect.fail(
            new HostValidationError({
              message: "Select a Model for this Workspace Session.",
              field: "model",
            }),
          );
      }),
    recordModelUpdate: (input) =>
      Effect.gen(function* () {
        const known = yield* find(input);
        if (!known || input.model === null) return;
        const saved = yield* storeEffect(
          store.setSelectedModel({
            ...known.ref,
            selectedModel: { ...input.model, runtimeKind: input.runtimeKind },
          }),
        );
        yield* publishUpdated(known.ref.workspaceId, saved);
      }),
    recordAcceptedMessage,
    observe: (envelope) =>
      Effect.gen(function* () {
        if (envelope.type === "session_removed") {
          pendingFinalMessages.delete(agentSessionRefKey(envelope.ref));
          return;
        }
        if (envelope.type === "session_upsert") {
          if (envelope.session.activity === "idle") yield* flushFinalMessage(envelope.session.ref);
          return;
        }
        if (envelope.type !== "transcript_event") return;
        const { event } = envelope;
        const key = agentSessionRefKey(event.sessionRef);
        if (event.type === "user_message") {
          yield* recordAcceptedMessage(event.sessionRef, event);
        } else if (event.type === "assistant_message") {
          if (yield* find(event.sessionRef)) {
            const occurredAt = Date.parse(event.timestamp);
            const previous = pendingFinalMessages.get(key);
            if (!previous || occurredAt > previous.occurredAt)
              pendingFinalMessages.set(key, { messageId: event.messageId, occurredAt });
          }
        } else if (event.type === "transcript_retracted") {
          const pending = pendingFinalMessages.get(key);
          if (pending && event.messageIds.includes(pending.messageId))
            pendingFinalMessages.delete(key);
        } else if (
          event.type === "session_idle" ||
          (event.type === "session_status" && event.status.type === "idle")
        ) {
          yield* flushFinalMessage(event.sessionRef);
        }
      }),
  };
};
