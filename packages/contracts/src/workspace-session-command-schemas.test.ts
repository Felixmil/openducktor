import { describe, expect, test } from "bun:test";
import {
  workspaceSessionArchiveInputSchema,
  workspaceSessionBranchNameSchema,
  workspaceSessionCreateInputSchema,
  workspaceSessionWorktreeInputSchema,
  workspaceSessionWorktreeNameSchema,
} from "./workspace-session-command-schemas";

describe("named chat worktree inputs", () => {
  test("requires explicit removal consent while omitted archive options keep Git resources", () => {
    const ref = { workspaceId: "repo", sessionId: "chat" };
    expect(workspaceSessionArchiveInputSchema.parse(ref)).toEqual({
      ...ref,
      confirmStop: false,
      removeWorktree: false,
    });
    expect(
      workspaceSessionArchiveInputSchema.parse({ ...ref, removeWorktree: true }).removeWorktree,
    ).toBe(true);
    expect(
      workspaceSessionArchiveInputSchema.safeParse({ ...ref, removeWorktree: "true" }).success,
    ).toBe(false);
  });
  test.each(["feat/add-facebook-login", "feat\\add-facebook-login", "feat add-facebook-login"])(
    "converts name separators to one safe directory component: %s",
    (name) => {
      expect(workspaceSessionWorktreeNameSchema.parse(name)).toBe("feat-add-facebook-login");
    },
  );
  test.each(["../escape", "/absolute", "C:\\absolute", ".", "", "bad:name"])(
    "rejects unsafe name %s",
    (name) => {
      expect(workspaceSessionWorktreeNameSchema.safeParse(name).success).toBe(false);
    },
  );
  test.each(["feature/chat", "my-branch", "release/v2.0", "_topic"])(
    "accepts branch %s",
    (name) => {
      expect(workspaceSessionBranchNameSchema.parse(name)).toBe(name);
    },
  );
  test.each([
    "",
    "HEAD",
    "@",
    "@{-1}",
    "-branch",
    "a..b",
    "a.lock",
    "a.lock/b",
    ".a",
    "a/.b",
    "a//b",
    "/a",
    "a/",
    "a.",
    "a b",
    "a\nb",
    "a\\b",
    "a:b",
    "a~b",
    "a^b",
    "a?b",
    "a*b",
    "a[b",
  ])("rejects branch %s", (name) => {
    expect(workspaceSessionBranchNameSchema.safeParse(name).success).toBe(false);
  });
  test("requires a branch only when reusing an existing branch", () => {
    expect(
      workspaceSessionWorktreeInputSchema.safeParse({
        mode: "from_branch",
        name: "review",
        branchName: null,
      }).success,
    ).toBe(false);
    expect(
      workspaceSessionWorktreeInputSchema.safeParse({
        mode: "from_name",
        name: "review",
        branchName: null,
      }).success,
    ).toBe(true);
    expect(
      workspaceSessionWorktreeInputSchema.safeParse({
        mode: "from_branch",
        name: "review",
        branchName: "feature/review",
      }).success,
    ).toBe(true);
  });
  test("requires worktree options exactly when a worktree is selected", () => {
    const input = {
      workspaceId: "repo",
      runtimeKind: "codex",
      selectedModel: null,
      customAgentRoleId: null,
      manualTitle: null,
    };
    const worktree = { mode: "from_name", name: "review", branchName: null };
    expect(
      workspaceSessionCreateInputSchema.safeParse({ ...input, location: "local_worktree" }).success,
    ).toBe(false);
    expect(
      workspaceSessionCreateInputSchema.safeParse({
        ...input,
        location: "local_worktree",
        worktree,
      }).success,
    ).toBe(true);
    expect(
      workspaceSessionCreateInputSchema.safeParse({ ...input, location: "local_repo_root" })
        .success,
    ).toBe(true);
    expect(
      workspaceSessionCreateInputSchema.safeParse({
        ...input,
        location: "local_repo_root",
        worktree,
      }).success,
    ).toBe(false);
  });
});
