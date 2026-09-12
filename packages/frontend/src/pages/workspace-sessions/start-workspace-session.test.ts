import { expect, test } from "bun:test";
import type { WorkspaceSessionStartResult } from "@openducktor/contracts";
import { createAgentSessionsStore } from "@/state/agent-sessions-store";
import { createAgentSessionFixture } from "@/test-utils/shared-test-fixtures";
import { startWorkspaceSession } from "./start-workspace-session";

const startedResult = (): WorkspaceSessionStartResult => ({
  session: {
    id: "chat",
    runtimeKind: "codex",
    externalSessionId: "native",
    executionTarget: { kind: "local_repo_root", workingDirectory: "/repo" },
    roleSnapshot: null,
    selectedModel: null,
    generatedTitle: null,
    manualTitle: "Chat",
    createdAt: 1000,
    updatedAt: 1000,
    archivedAt: null,
  },
  runtimeSession: {
    runtimeKind: "codex",
    externalSessionId: "native",
    workingDirectory: "/repo",
    startedAt: new Date(1000).toISOString(),
    status: "idle",
  },
});

test("a newly started chat has a known empty baseline without a history read", async () => {
  const store = createAgentSessionsStore("/repo");
  const result = await startWorkspaceSession(
    { workspaceId: "workspace", sessionId: "chat" },
    store,
    () => true,
    async () => startedResult(),
  );
  expect(store.getSessionSnapshot(result.identity)).toMatchObject({
    historyLoadState: "loaded",
    sessionAssociation: { kind: "repository" },
    title: "Chat",
  });
  expect(store.getSessionSnapshot(result.identity)?.messages.items).toEqual([]);
});

test("start response keeps transcript events that arrived before the response", async () => {
  const store = createAgentSessionsStore("/repo");
  const current = createAgentSessionFixture({
    externalSessionId: "native",
    runtimeKind: "codex",
    workingDirectory: "/repo",
    sessionAssociation: { kind: "repository" },
    historyLoadState: "not_requested",
    status: "running",
  });
  store.replaceSession(current);
  const result = await startWorkspaceSession(
    { workspaceId: "workspace", sessionId: "chat" },
    store,
    () => true,
    async () => startedResult(),
  );
  const saved = store.getSessionSnapshot(result.identity);
  expect(saved?.messages).toBe(current.messages);
  expect(saved?.status).toBe("running");
  expect(saved?.historyLoadState).toBe("loaded");
});

test("an already-bound chat is not given a fabricated empty baseline", async () => {
  const store = createAgentSessionsStore("/repo");
  const result = await startWorkspaceSession(
    { workspaceId: "workspace", sessionId: "chat" },
    store,
    () => true,
    async () => ({ ...startedResult(), runtimeSession: null }),
  );
  expect(store.getSessionSnapshot(result.identity)).toBeNull();
});

test("a late start response cannot seed another workspace", async () => {
  const store = createAgentSessionsStore("/other");
  await expect(
    startWorkspaceSession(
      { workspaceId: "workspace", sessionId: "chat" },
      store,
      () => false,
      async () => startedResult(),
    ),
  ).rejects.toThrow("Workspace changed");
  expect(store.listSessionSnapshots()).toEqual([]);
});
