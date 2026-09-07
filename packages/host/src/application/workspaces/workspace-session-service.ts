import {
  type WorkspaceSession,
  type AgentSessionControlStartInput,
  type WorkspaceSessionCreateInput,
  type WorkspaceSessionCreateResult,
  type WorkspaceSessionRefInput,
  workspaceSessionCreateInputSchema,
  workspaceSessionRenameInputSchema,
} from "@openducktor/contracts";
import { Cause, Clock, Effect, Exit } from "effect";
import {
  HostOperationError,
  HostResourceError,
  HostValidationError,
} from "../../effect/host-errors";
import type { WorkspaceSessionStorePort } from "../../ports/workspace-session-store-port";
import type { AgentSessionLiveStateService } from "../agent-sessions/agent-session-live-state-service";
import type { RuntimeOrchestratorService } from "../runtimes/runtime-orchestrator-service";
import type { WorkspaceSettingsService } from "./workspace-settings-model";
import {
  validateWorkspaceSessionTarget,
  withWorkspaceSessionTarget,
  type WorkspaceSessionTargetDependencies,
} from "./workspace-session-target";

export type WorkspaceSessionServiceDependencies = WorkspaceSessionTargetDependencies & {
  store: WorkspaceSessionStorePort;
  settings: Pick<WorkspaceSettingsService, "getRepoConfig" | "listCustomAgentRoles">;
  runtime: Pick<RuntimeOrchestratorService, "runtimeEnsure">;
  live: Pick<
    AgentSessionLiveStateService,
    "startSession" | "releaseSession" | "read" | "stopSession"
  >;
};

export const createWorkspaceSessionService = (
  dependencies: WorkspaceSessionServiceDependencies,
) => {
  const { store, settings, live, runtime, git } = dependencies;
  const scopeFor = (workspaceId: string) =>
    Effect.gen(function* () {
      const config = yield* settings.getRepoConfig(workspaceId);
      const repoPath = yield* git.canonicalizePath(config.repoPath);
      return { workspaceId, repoPath };
    });
  const recordFor = (input: WorkspaceSessionRefInput) =>
    Effect.gen(function* () {
      const scope = yield* scopeFor(input.workspaceId);
      const ref = { ...scope, sessionId: input.sessionId };
      const session = yield* store.get(ref);
      return { ref, session };
    });
  return {
    listActive: (workspaceId: string) =>
      scopeFor(workspaceId).pipe(Effect.flatMap(store.listActive)),
    listArchived: (workspaceId: string) =>
      scopeFor(workspaceId).pipe(Effect.flatMap(store.listArchived)),
    get: (input: WorkspaceSessionRefInput) =>
      recordFor(input).pipe(Effect.map(({ session }) => session)),
    create: (rawInput: WorkspaceSessionCreateInput) =>
      Effect.gen(function* () {
        const input = yield* Effect.try({
          try: () => workspaceSessionCreateInputSchema.parse(rawInput),
          catch: (cause) =>
            new HostValidationError({
              message: "Invalid Workspace Session creation input.",
              cause,
            }),
        });
        const manualTitle = yield* Effect.try({
          try: () =>
            workspaceSessionRenameInputSchema.shape.manualTitle.parse(input.manualTitle) || null,
          catch: (cause) =>
            new HostValidationError({
              message: "Workspace Session title must be at most 120 characters.",
              field: "manualTitle",
              cause,
            }),
        });
        const sessionId = crypto.randomUUID();
        const config = yield* settings.getRepoConfig(input.workspaceId);
        const roles =
          input.customAgentRoleId === null ? [] : yield* settings.listCustomAgentRoles();
        const role = roles.find((candidate) => candidate.id === input.customAgentRoleId);
        if (input.customAgentRoleId !== null && !role) {
          return yield* Effect.fail(
            new HostResourceError({
              resource: input.customAgentRoleId,
              operation: "workspaceSession.create",
              message:
                "The selected Custom Agent Role no longer exists. Select another Role or No Role.",
            }),
          );
        }
        const roleSnapshot = role ? { ...role } : null;
        const repoPath = yield* git.canonicalizePath(config.repoPath);
        return yield* withWorkspaceSessionTarget(
          dependencies,
          {
            sessionId,
            repoConfig: { ...config, repoPath },
            location: input.location,
            confirmUncommittedChanges: input.confirmUncommittedChanges,
          },
          (executionTarget, retainTarget) =>
            runtime.runtimeEnsure({ repoPath, runtimeKind: input.runtimeKind }).pipe(
              Effect.zipRight(
                Effect.uninterruptible(
                  Effect.gen(function* () {
                    const startInput: AgentSessionControlStartInput = {
                      repoPath,
                      runtimeKind: input.runtimeKind,
                      workingDirectory: executionTarget.workingDirectory,
                      sessionScope: { kind: "repository" },
                      systemPrompt: roleSnapshot?.systemPrompt ?? "",
                    };
                    if (input.selectedModel !== null) startInput.model = input.selectedModel;
                    const runtimeSession = yield* live.startSession(startInput);
                    const now = yield* Clock.currentTimeMillis;
                    const saved = yield* Effect.exit(
                      Effect.gen(function* () {
                        if (
                          runtimeSession.runtimeKind !== input.runtimeKind ||
                          runtimeSession.workingDirectory !== executionTarget.workingDirectory
                        ) {
                          return yield* Effect.fail(
                            new HostValidationError({
                              message:
                                "Runtime returned a different Workspace Session identity or directory.",
                              field: "runtimeSession",
                            }),
                          );
                        }
                        const session: WorkspaceSession = {
                          id: sessionId,
                          runtimeKind: input.runtimeKind,
                          externalSessionId: runtimeSession.externalSessionId,
                          executionTarget,
                          roleSnapshot,
                          selectedModel: input.selectedModel,
                          generatedTitle: null,
                          manualTitle,
                          createdAt: now,
                          updatedAt: now,
                          archivedAt: null,
                        };
                        return yield* store.create({
                          workspaceId: input.workspaceId,
                          repoPath,
                          session,
                        });
                      }),
                    );
                    if (Exit.isSuccess(saved)) {
                      retainTarget();
                      return {
                        session: saved.value,
                        runtimeSession,
                      } satisfies WorkspaceSessionCreateResult;
                    }
                    const released = yield* Effect.exit(
                      live.releaseSession({
                        repoPath,
                        runtimeKind: runtimeSession.runtimeKind,
                        externalSessionId: runtimeSession.externalSessionId,
                        workingDirectory: runtimeSession.workingDirectory,
                      }),
                    );
                    const releaseMessage = Exit.isFailure(released)
                      ? `\nLocal runtime release also failed: ${Cause.pretty(released.cause)}`
                      : "";
                    return yield* Effect.fail(
                      new HostOperationError({
                        operation: "workspaceSession.create.persist",
                        message: `Workspace Session creation failed: ${Cause.pretty(saved.cause)}\nRuntime history ${runtimeSession.externalSessionId} was retained.${releaseMessage}`,
                        cause: { save: saved.cause, release: released },
                      }),
                    );
                  }),
                ),
              ),
            ),
        );
      }),
    rename: (input: WorkspaceSessionRefInput & { manualTitle: string | null }) =>
      Effect.gen(function* () {
        const { ref, session } = yield* recordFor(input);
        if (session.archivedAt !== null)
          return yield* Effect.fail(
            new HostValidationError({
              message: "Restore this Workspace Session before renaming it.",
              field: "sessionId",
            }),
          );
        return yield* store.rename({ ...ref, manualTitle: input.manualTitle });
      }),
    archive: (input: WorkspaceSessionRefInput & { confirmStop: boolean }) =>
      Effect.gen(function* () {
        const { ref, session } = yield* recordFor(input);
        if (session.archivedAt !== null) return session;
        yield* validateWorkspaceSessionTarget(dependencies, ref.repoPath, session.executionTarget);
        const runtimeRef = {
          repoPath: ref.repoPath,
          runtimeKind: session.runtimeKind,
          externalSessionId: session.externalSessionId,
          workingDirectory: session.executionTarget.workingDirectory,
        };
        const observed = yield* live.read(runtimeRef);
        if (observed.type === "live" && observed.session.activity !== "idle") {
          if (!input.confirmStop)
            return yield* Effect.fail(
              new HostValidationError({
                message: "This Workspace Session is running. Confirm Stop before archiving it.",
                field: "confirmStop",
              }),
            );
          yield* live.stopSession(runtimeRef);
        }
        return yield* store.archive({ ...ref, archivedAt: yield* Clock.currentTimeMillis });
      }),
    restore: (input: WorkspaceSessionRefInput) =>
      Effect.gen(function* () {
        const { ref, session } = yield* recordFor(input);
        yield* validateWorkspaceSessionTarget(dependencies, ref.repoPath, session.executionTarget);
        return yield* store.restore(ref);
      }),
  };
};

export type WorkspaceSessionService = ReturnType<typeof createWorkspaceSessionService>;
