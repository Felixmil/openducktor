import { describe, expect, test } from "bun:test";
import { hostInvokeFailureSchema } from "./host-invoke-failure-schemas";

test.each(["worktree.name", "worktree.branchName"])("accepts validation for %s", (field) => {
  const failure = { kind: "workspace_session_validation", field };
  expect(hostInvokeFailureSchema.parse(failure)).toEqual(failure);
  expect(hostInvokeFailureSchema.safeParse({ ...failure, field: "unrelated" }).success).toBe(false);
});

test("workspace session confirmation only accepts stopping a session", () => {
  const failure = { kind: "workspace_session_confirmation", field: "confirmStop" };
  expect(hostInvokeFailureSchema.parse(failure)).toEqual(failure);
  expect(
    hostInvokeFailureSchema.safeParse({ ...failure, field: "confirmUncommittedChanges" }).success,
  ).toBe(false);
});

describe("accepted-message failure", () => {
  const failure = {
    kind: "agent_session_message_accepted",
    sessionRef: {
      repoPath: "/repo",
      runtimeKind: "codex",
      workingDirectory: "/repo",
      externalSessionId: "native",
    },
    acceptedMessage: {
      type: "user_message",
      externalSessionId: "native",
      messageId: "message-1",
      timestamp: "2026-09-12T10:00:00Z",
      message: "Hello",
      parts: [],
      state: "read",
    },
    stage: "live_update",
  };
  test("retains the native message and exact session reference", () => {
    expect(hostInvokeFailureSchema.parse(failure)).toEqual(failure);
  });
  test.each(["sessionRef", "acceptedMessage", "stage"])("requires %s", (field) => {
    expect(hostInvokeFailureSchema.safeParse({ ...failure, [field]: undefined }).success).toBe(
      false,
    );
  });
  test("rejects an invalid accepted message", () => {
    expect(
      hostInvokeFailureSchema.safeParse({
        ...failure,
        acceptedMessage: { ...failure.acceptedMessage, messageId: null },
      }).success,
    ).toBe(false);
  });
});
