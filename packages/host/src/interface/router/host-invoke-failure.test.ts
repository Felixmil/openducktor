import { describe, expect, test } from "bun:test";
import { WorkspaceTextFileWriteError } from "../../application/filesystem/workspace-text-file-service";
import { HostValidationError } from "../../effect/host-errors";
import { hostInvokeFailureFromError } from "./host-invoke-failure";

describe("hostInvokeFailureFromError", () => {
  test("preserves stop confirmation but does not classify other validation failures as confirmations", () => {
    expect(
      hostInvokeFailureFromError(
        new HostValidationError({ message: "Confirm stop", field: "confirmStop" }),
      ),
    ).toEqual({ kind: "workspace_session_confirmation", field: "confirmStop" });
    for (const field of ["confirmUncommittedChanges", "otherField"]) {
      expect(
        hostInvokeFailureFromError(new HostValidationError({ message: "Invalid input", field })),
      ).toBeUndefined();
    }
  });
  test.each(["worktree.name", "worktree.branchName"])("preserves validation for %s", (field) => {
    expect(
      hostInvokeFailureFromError(
        new HostValidationError({ message: "Choose another value.", field }),
      ),
    ).toEqual({ kind: "workspace_session_validation", field });
  });
  test("preserves structured workspace text file write failures", () => {
    expect(
      hostInvokeFailureFromError(
        new WorkspaceTextFileWriteError({
          message: "The file changed after it was loaded.",
          failure: {
            code: "stale_revision",
            message: "The file changed after it was loaded.",
            rootPath: "/repo",
            relativePath: "file.txt",
          },
        }),
      ),
    ).toEqual({
      kind: "workspace_text_file_write",
      workspaceTextFileWriteFailure: {
        code: "stale_revision",
        message: "The file changed after it was loaded.",
        rootPath: "/repo",
        relativePath: "file.txt",
      },
    });
  });
});
