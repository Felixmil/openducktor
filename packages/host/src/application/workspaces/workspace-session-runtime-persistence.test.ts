import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  AcceptedAgentUserMessage,
  AgentSessionControlResumeInput,
  AgentSessionControlSendInput,
  AgentSessionLiveEnvelope,
  AgentSessionLiveRef,
  AgentSessionTranscriptEvent,
  WorkspaceSession,
} from "@openducktor/contracts";
import { repoConfigSchema } from "@openducktor/contracts";
import { Effect } from "effect";
import { createLiveSessionAdapterRegistry } from "../../adapters/agent-sessions/live-session-adapter-registry";
import {
  createSqliteTaskStoreHarness,
  type SqliteTaskStoreTestHarness,
} from "../../adapters/sqlite/sqlite-task-store-test-support";
import { createSqliteWorkspaceSessionStore } from "../../adapters/sqlite/sqlite-workspace-session-store";
import { HostOperationError } from "../../effect/host-errors";
import {
  createAgentSessionRuntimeAdapterTestDouble,
  createGitPortTestDouble,
} from "../../test-support/service-test-doubles";
import { createAgentSessionLiveStateService } from "../agent-sessions/agent-session-live-state-service";
import { createWorkspaceSessionRuntimePersistence } from "./workspace-session-runtime-persistence";

describe("Workspace Session persistence through the shared live service", () => {
  let database: SqliteTaskStoreTestHarness;
  beforeEach(async () => {
    database = await createSqliteTaskStoreHarness();
  });
  afterEach(async () => {
    await database.cleanup();
  });

  const setup = async () => {
    const ref: AgentSessionLiveRef = {
      repoPath: database.repoPath,
      runtimeKind: "opencode",
      externalSessionId: "native",
      workingDirectory: `${database.repoPath}/session-worktree`,
    };
    const storeRef = {
      repoPath: database.repoPath,
      workspaceId: "fairnest",
      sessionId: "session-1",
    };
    const record: WorkspaceSession = {
      id: "session-1",
      runtimeKind: "opencode",
      externalSessionId: "native",
      executionTarget: { kind: "local_worktree", workingDirectory: ref.workingDirectory },
      roleSnapshot: {
        id: "deleted-role",
        name: "Original role",
        systemPrompt: "Original instructions.",
      },
      selectedModel: {
        runtimeKind: "opencode",
        providerId: "provider",
        modelId: "stored-model",
        variant: "high",
      },
      generatedTitle: null,
      manualTitle: null,
      createdAt: 0,
      updatedAt: 0,
      archivedAt: null,
    };
    const store = createSqliteWorkspaceSessionStore(database.contextProvider);
    await Effect.runPromise(store.create({ ...storeRef, session: record }));
    const updates: Array<{ workspaceId: string; session: WorkspaceSession }> = [];
    const events: AgentSessionLiveEnvelope[] = [];
    const inputs: Array<AgentSessionControlSendInput | AgentSessionControlResumeInput> = [];
    const activityTimes: number[] = [];
    const state = { failSend: false, failModel: false, failActivity: false, registered: true };
    const failure = (message: string) =>
      Effect.fail(new HostOperationError({ operation: "test", message }));
    const accepted = (
      text = "First accepted prompt",
      timestamp = "2026-09-07T10:00:00Z",
    ): AcceptedAgentUserMessage => ({
      type: "user_message",
      externalSessionId: "native",
      sessionRef: ref,
      timestamp,
      messageId: "user-1",
      message: text,
      parts: [{ kind: "text", text }],
      state: "read",
    });
    const persistence = createWorkspaceSessionRuntimePersistence({
      store: {
        ...store,
        recordActivity: (input) => {
          activityTimes.push(input.activity.occurredAt);
          return state.failActivity
            ? failure("activity write failed")
            : store.recordActivity(input);
        },
      },
      settings: {
        getRepoConfigByRepoPath: () =>
          Effect.succeed(
            repoConfigSchema.parse({
              workspaceId: "fairnest",
              workspaceName: "Fairnest",
              repoPath: database.repoPath,
              defaultRuntimeKind: "opencode",
            }),
          ),
      },
      git: createGitPortTestDouble({
        canonicalizePath: (value) => Effect.succeed(value),
        isGitRepository: () => Effect.succeed(true),
        shareGitCommonDirectory: () => Effect.succeed(true),
        isRegisteredWorktree: () => Effect.succeed(state.registered),
      }),
      publishUpdated: (workspaceId, session) =>
        Effect.sync(() => {
          updates.push({ workspaceId, session });
        }),
    });
    const live = createAgentSessionLiveStateService({
      adapterRegistry: createLiveSessionAdapterRegistry(),
      persistence,
      faultLog: () => Effect.void,
      publish: (event) => {
        events.push(event);
      },
    });
    await Effect.runPromise(
      live.registerRuntimeAdapter(
        createAgentSessionRuntimeAdapterTestDouble(
          { runtimeId: "runtime", runtimeKind: "opencode", repoPath: database.repoPath },
          {
            matches: () => true,
            listSnapshots: () => Effect.succeed([]),
            listRetainedSnapshots: () => Effect.succeed([]),
            resumeSession: (input) =>
              Effect.sync(() => {
                inputs.push(input);
                return {
                  externalSessionId: input.externalSessionId,
                  runtimeKind: input.runtimeKind,
                  workingDirectory: input.workingDirectory,
                  startedAt: "2026-09-07T10:00:00Z",
                  status: "idle",
                };
              }),
            sendUserMessage: (input) =>
              Effect.suspend(() => {
                inputs.push(input);
                return state.failSend
                  ? failure("runtime rejected message")
                  : Effect.succeed(accepted());
              }),
            updateSessionModel: () =>
              state.failModel ? failure("runtime rejected model") : Effect.void,
          },
        ),
      ),
    );
    events.length = 0;
    const emit = (event: AgentSessionTranscriptEvent) =>
      Effect.runPromise(
        live.runAdapterMutation(
          Effect.succeed({ value: undefined, changes: [{ type: "transcript_event", event }] }),
        ),
      );
    const get = () => Effect.runPromise(store.get(storeRef));
    return {
      ref,
      storeRef,
      record,
      store,
      live,
      persistence,
      updates,
      events,
      inputs,
      activityTimes,
      state,
      accepted,
      emit,
      get,
    };
  };

  test("uses the stored Role and Model on resume and send after catalog edits or deletion", async () => {
    const h = await setup();
    const scope = { kind: "repository" } as const;
    await Effect.runPromise(
      h.live.resumeSession({
        ...h.ref,
        sessionScope: scope,
        systemPrompt: "New catalog instructions.",
        model: { providerId: "other", modelId: "other-model" },
      }),
    );
    await Effect.runPromise(
      h.live.sendUserMessage({
        ...h.ref,
        sessionScope: scope,
        systemPrompt: "Client override",
        parts: [{ kind: "text", text: "Prompt" }],
      }),
    );
    expect(h.inputs).toHaveLength(2);
    for (const input of h.inputs)
      expect(input).toMatchObject({
        systemPrompt: "Original instructions.",
        model: h.record.selectedModel,
      });
    const saved = await h.get();
    expect(saved.generatedTitle).toBe("First accepted prompt");
    expect(saved.updatedAt).toBe(Date.parse("2026-09-07T10:00:00Z"));
    expect(h.updates.at(-1)).toEqual({ workspaceId: "fairnest", session: saved });
  });

  test("does not persist rejected sends or model changes and saves an accepted model", async () => {
    const h = await setup();
    h.state.failSend = true;
    await expect(
      Effect.runPromise(
        h.live.sendUserMessage({
          ...h.ref,
          sessionScope: { kind: "repository" },
          parts: [{ kind: "text", text: "Rejected" }],
        }),
      ),
    ).rejects.toThrow("runtime rejected message");
    expect(await h.get()).toEqual(h.record);
    h.state.failModel = true;
    const model = { providerId: "provider", modelId: "new-model", variant: "low" };
    const update = { ...h.ref, sessionScope: { kind: "repository" as const }, model };
    await expect(Effect.runPromise(h.live.updateSessionModel(update))).rejects.toThrow(
      "runtime rejected model",
    );
    expect(await h.get()).toEqual(h.record);
    h.state.failModel = false;
    await Effect.runPromise(h.live.updateSessionModel(update));
    expect((await h.get()).selectedModel).toEqual({ ...model, runtimeKind: "opencode" });
    expect((await h.get()).updatedAt).toBe(0);
  });

  test("generates the title once and does not write duplicate or older user activity", async () => {
    const h = await setup();
    await h.emit({ ...h.accepted(), sessionRef: h.ref });
    await h.emit({ ...h.accepted("Duplicate with other text"), sessionRef: h.ref });
    await h.emit({ ...h.accepted("Older prompt", "2026-09-06T10:00:00Z"), sessionRef: h.ref });
    expect((await h.get()).generatedTitle).toBe("First accepted prompt");
    expect(h.activityTimes).toEqual([Date.parse("2026-09-07T10:00:00Z")]);
  });

  test("records the final assistant time only on idle, ignoring deltas and duplicate idle events", async () => {
    const h = await setup();
    const base = {
      externalSessionId: "native",
      sessionRef: h.ref,
      timestamp: "2026-09-07T10:01:00Z",
    };
    await h.emit({ ...base, type: "assistant_delta", channel: "text", delta: "Partial" });
    await h.emit({
      ...base,
      type: "assistant_message",
      messageId: "assistant-1",
      message: "Final answer",
    });
    expect(h.activityTimes).toEqual([]);
    const idle = { ...base, timestamp: "2026-09-07T10:02:00Z", type: "session_idle" } as const;
    await h.emit(idle);
    await h.emit(idle);
    expect(h.activityTimes).toEqual([Date.parse(base.timestamp)]);
    expect((await h.get()).updatedAt).toBe(Date.parse(base.timestamp));
  });

  test("does not count retracted or older final messages as new activity", async () => {
    const h = await setup();
    await h.emit({ ...h.accepted(), sessionRef: h.ref });
    const base = {
      externalSessionId: "native",
      sessionRef: h.ref,
      timestamp: "2026-09-06T10:01:00Z",
    };
    await h.emit({ ...base, type: "assistant_message", messageId: "old", message: "Old answer" });
    await h.emit({ ...base, type: "session_idle" });
    await h.emit({
      ...base,
      timestamp: "2026-09-08T10:00:00Z",
      type: "assistant_message",
      messageId: "retracted",
      message: "Retracted answer",
    });
    await h.emit({ ...base, type: "transcript_retracted", messageIds: ["retracted"] });
    await h.emit({ ...base, type: "session_idle" });
    expect(h.activityTimes).toEqual([Date.parse("2026-09-07T10:00:00Z")]);
  });

  test("rejects target mismatch, missing worktrees, and archived sessions before calling the runtime", async () => {
    const h = await setup();
    const resume = { ...h.ref, sessionScope: { kind: "repository" } as const };
    await expect(
      Effect.runPromise(h.live.resumeSession({ ...resume, workingDirectory: "/wrong" })),
    ).rejects.toThrow("does not match");
    h.state.registered = false;
    await expect(Effect.runPromise(h.live.resumeSession(resume))).rejects.toThrow(
      "not a registered worktree",
    );
    h.state.registered = true;
    await Effect.runPromise(h.store.archive({ ...h.storeRef, archivedAt: 1 }));
    await expect(Effect.runPromise(h.live.resumeSession(resume))).rejects.toThrow("Restore");
    expect(h.inputs).toEqual([]);
  });

  test("does not import unknown runtime sessions", async () => {
    const h = await setup();
    const unknown = { ...h.ref, externalSessionId: "unknown" };
    await h.emit({ ...h.accepted(), externalSessionId: "unknown", sessionRef: unknown });
    expect(await h.get()).toEqual(h.record);
    expect(h.updates).toEqual([]);
  });

  test("publishes the transcript and a scoped error when metadata persistence fails", async () => {
    const h = await setup();
    h.state.failActivity = true;
    const event = { ...h.accepted(), sessionRef: h.ref };
    await expect(h.emit(event)).rejects.toThrow("activity write failed");
    expect(h.events).toEqual([
      { type: "transcript_event", event },
      {
        type: "fault",
        repoPath: h.ref.repoPath,
        ref: h.ref,
        operation: "agent-session.persist",
        message: "activity write failed",
      },
    ]);
    expect((await h.get()).updatedAt).toBe(0);
  });
});
