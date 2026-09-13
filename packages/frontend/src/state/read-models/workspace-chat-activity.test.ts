import { expect, test } from "bun:test";
import type { WorkspaceSession } from "@openducktor/contracts";
import type { RepositoryAgentSessionSummary } from "../agent-session-snapshots";
import { summarizeWorkspaceChatActivity } from "./workspace-chat-activity";

const record = (overrides: Partial<WorkspaceSession> = {}): WorkspaceSession => ({
  id: "chat-1",
  runtimeKind: "opencode",
  externalSessionId: "native-1",
  executionTarget: { kind: "local_repo_root", workingDirectory: "/repo" },
  roleSnapshot: null,
  selectedModel: null,
  manualTitle: "Release plan",
  generatedTitle: "Generated title",
  createdAt: 1000,
  updatedAt: 1000,
  archivedAt: null,
  ...overrides,
});
const session = (
  overrides: Partial<RepositoryAgentSessionSummary> = {},
): RepositoryAgentSessionSummary => ({
  runtimeKind: "opencode",
  externalSessionId: "native-1",
  workingDirectory: "/repo",
  activityState: "running",
  startedAt: "2026-09-08T12:00:00Z",
  selectedModel: null,
  pendingApprovalCount: 0,
  pendingQuestionCount: 0,
  ...overrides,
});

test("joins chat identity and uses the saved title without a custom role", () => {
  const result = summarizeWorkspaceChatActivity([session()], [record()]);
  expect(result.activeSessionCount).toBe(1);
  expect(result.activeSessions[0]).toMatchObject({
    workspaceSessionId: "chat-1",
    taskId: null,
    role: null,
    taskTitle: "Release plan",
  });
  expect(
    summarizeWorkspaceChatActivity([session()], [record({ manualTitle: "Renamed" })])
      .activeSessions[0]?.taskTitle,
  ).toBe("Renamed");
});

test.each(["pendingApprovalCount", "pendingQuestionCount"] as const)(
  "puts a chat with %s in needs input only",
  (count) => {
    const result = summarizeWorkspaceChatActivity(
      [session({ activityState: "waiting_input", [count]: 1 })],
      [record()],
    );
    expect(result.activeSessions).toEqual([]);
    expect(result.waitingForInputCount).toBe(1);
    expect(result.waitingForInputSessions[0]?.workspaceSessionId).toBe("chat-1");
  },
);

test("excludes archived, unknown, idle, and mismatched runtime or directory sessions", () => {
  const sessions = [
    session({ runtimeKind: "codex" }),
    session({ workingDirectory: "/other" }),
    session({ externalSessionId: "unknown" }),
    session({ activityState: "idle" }),
  ];
  expect(summarizeWorkspaceChatActivity(sessions, [record()]).activeSessionCount).toBe(0);
  expect(
    summarizeWorkspaceChatActivity([session()], [record({ archivedAt: 2000 })]).activeSessionCount,
  ).toBe(0);
});
