import { expect, test } from "bun:test";
import type { HostCommandName, WorkspaceSession } from "@openducktor/contracts";
import { createHostClient } from "./index";

test("creates a draft, starts it, and saves draft models through separate host commands", async () => {
  const draft: WorkspaceSession = {
    id: "chat",
    runtimeKind: "codex",
    externalSessionId: null,
    executionTarget: { kind: "local_repo_root", workingDirectory: "/repo" },
    roleSnapshot: null,
    selectedModel: null,
    generatedTitle: null,
    manualTitle: null,
    createdAt: 1000,
    updatedAt: 1000,
    archivedAt: null,
  };
  const calls: HostCommandName[] = [];
  const client = createHostClient(async (command, _args, schema) => {
    calls.push(command);
    if (command === "workspace_session_create") return schema.parse({ session: draft });
    if (command === "workspace_session_start")
      return schema.parse({
        session: { ...draft, externalSessionId: "native" },
        runtimeSession: null,
      });
    return schema.parse(draft);
  });
  const created = await client.workspaceSessionCreate({
    workspaceId: "workspace",
    runtimeKind: "codex",
    selectedModel: null,
    customAgentRoleId: null,
    location: "local_repo_root",
    manualTitle: null,
    confirmUncommittedChanges: false,
  });
  expect(created).toEqual({ session: draft });
  const ref = { workspaceId: "workspace", sessionId: "chat" };
  expect((await client.workspaceSessionStart(ref)).session.externalSessionId).toBe("native");
  await client.workspaceSessionSetDraftModel({
    ...ref,
    selectedModel: { runtimeKind: "codex", providerId: "openai", modelId: "model" },
  });
  expect(calls).toEqual([
    "workspace_session_create",
    "workspace_session_start",
    "workspace_session_set_draft_model",
  ]);
});

test("rejects malformed draft and start responses", async () => {
  const client = createHostClient(async (_command, _args, schema) =>
    schema.parse({ session: { id: "chat" } }),
  );
  await expect(
    client.workspaceSessionStart({ workspaceId: "workspace", sessionId: "chat" }),
  ).rejects.toThrow();
});

test("reads archive impact and forwards explicit worktree removal through the host boundary", async () => {
  const calls: Array<{ command: HostCommandName; args: unknown }> = [];
  const preview = { branchName: "feature/chat", worktreeExists: true, hasUncommittedChanges: true };
  const archived: WorkspaceSession = {
    id: "chat",
    runtimeKind: "codex",
    externalSessionId: "native",
    executionTarget: {
      kind: "local_worktree",
      workingDirectory: "/worktrees/chat",
      branchName: "feature/chat",
      worktreeState: "removed",
    },
    roleSnapshot: null,
    selectedModel: null,
    generatedTitle: null,
    manualTitle: null,
    createdAt: 1,
    updatedAt: 1,
    archivedAt: 2,
  };
  const client = createHostClient(async (command, args, schema) => {
    calls.push({ command, args });
    return schema.parse(command === "workspace_session_archive_preview" ? preview : archived);
  });
  const ref = { workspaceId: "workspace", sessionId: "chat" };
  expect(await client.workspaceSessionArchivePreview(ref)).toEqual(preview);
  expect(
    await client.workspaceSessionArchive({ ...ref, confirmStop: true, removeWorktree: true }),
  ).toEqual(archived);
  expect(calls).toEqual([
    { command: "workspace_session_archive_preview", args: ref },
    {
      command: "workspace_session_archive",
      args: { ...ref, confirmStop: true, removeWorktree: true },
    },
  ]);
});
