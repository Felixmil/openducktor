import type { RepoConfig, WorkspaceSessionExecutionTarget } from "@openducktor/contracts";
import { Cause, Effect, Exit } from "effect";
import { type HostError, HostOperationError, HostValidationError } from "../../effect/host-errors";
import type { GitPort } from "../../ports/git-port";
import type { SettingsConfigPort } from "../../ports/settings-config-port";
import type { SystemCommandPort } from "../../ports/system-command-port";
import type { WorktreeFilePort } from "../../ports/worktree-file-port";
import { runHookCommandsAllowFailure } from "../tasks/support/workflow-hooks";

export type WorkspaceSessionTargetDependencies = {
  git: GitPort;
  settingsConfig: SettingsConfigPort;
  worktreeFiles: WorktreeFilePort;
  systemCommands: SystemCommandPort;
};

export const validateWorkspaceSessionTarget = (
  { git }: Pick<WorkspaceSessionTargetDependencies, "git">,
  repoPath: string,
  target: WorkspaceSessionExecutionTarget,
) =>
  Effect.gen(function* () {
    const canonicalPath = yield* git.canonicalizePath(target.workingDirectory);
    if (canonicalPath !== target.workingDirectory || !(yield* git.isGitRepository(canonicalPath))) {
      return yield* Effect.fail(
        new HostValidationError({
          message: `Workspace Session directory is not the saved canonical Git directory: ${target.workingDirectory}`,
          field: "workingDirectory",
        }),
      );
    }
    if (target.kind === "local_repo_root") {
      if (canonicalPath !== repoPath) {
        return yield* Effect.fail(
          new HostValidationError({
            message: "Workspace Session checkout no longer matches its Workspace.",
            field: "workingDirectory",
          }),
        );
      }
      return;
    }
    if (
      !(yield* git.shareGitCommonDirectory(repoPath, canonicalPath)) ||
      !(yield* git.isRegisteredWorktree(repoPath, canonicalPath))
    ) {
      return yield* Effect.fail(
        new HostValidationError({
          message: `Workspace Session directory is not a registered worktree of ${repoPath}: ${canonicalPath}`,
          field: "workingDirectory",
        }),
      );
    }
  });

export const withWorkspaceSessionTarget = <A, E>(
  dependencies: WorkspaceSessionTargetDependencies,
  input: {
    sessionId: string;
    repoConfig: RepoConfig;
    location: WorkspaceSessionExecutionTarget["kind"];
    confirmUncommittedChanges: boolean;
  },
  use: (target: WorkspaceSessionExecutionTarget, retainTarget: () => void) => Effect.Effect<A, E>,
): Effect.Effect<A, E | HostError> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const { git, settingsConfig, worktreeFiles, systemCommands } = dependencies;
      const { repoConfig } = input;
      const repoPath = yield* git.canonicalizePath(repoConfig.repoPath);
      if (!(yield* git.isGitRepository(repoPath))) {
        return yield* Effect.fail(
          new HostValidationError({
            message: `Workspace is not a Git repository: ${repoPath}`,
            field: "repoPath",
          }),
        );
      }
      if (input.location === "local_repo_root") {
        return yield* restore(
          use({ kind: "local_repo_root", workingDirectory: repoPath }, () => {}),
        );
      }
      const changedFiles = yield* git.getStatus(repoPath);
      if (changedFiles.length > 0 && !input.confirmUncommittedChanges) {
        return yield* Effect.fail(
          new HostValidationError({
            message:
              "Uncommitted checkout changes will not enter the new worktree. Confirm before creating this session.",
            field: "confirmUncommittedChanges",
          }),
        );
      }
      const base =
        repoConfig.worktreeBasePath === undefined
          ? settingsConfig.defaultWorktreeBasePath(repoConfig.workspaceId)
          : settingsConfig.resolveConfiguredPath(repoConfig.worktreeBasePath);
      const namespace = settingsConfig.join(base, "workspace-sessions");
      const workingDirectory = settingsConfig.join(namespace, input.sessionId);
      const branch = `${repoConfig.branchPrefix}/session-${input.sessionId.slice(0, 8)}`;
      if (
        (yield* settingsConfig.pathExists(workingDirectory)) ||
        (yield* git.referenceExists(repoPath, `refs/heads/${branch}`))
      ) {
        return yield* Effect.fail(
          new HostValidationError({
            message: `Workspace Session worktree path or branch already exists: ${workingDirectory}, ${branch}`,
            field: "location",
          }),
        );
      }
      yield* worktreeFiles.ensureDirectory(namespace);
      let retained = false;
      const retainTarget = () => {
        retained = true;
      };
      const result = yield* Effect.exit(
        restore(
          Effect.gen(function* () {
            yield* git.createWorktree(repoPath, workingDirectory, branch, true, "HEAD");
            yield* worktreeFiles.copyConfiguredPaths(
              repoPath,
              workingDirectory,
              repoConfig.worktreeCopyPaths,
            );
            const hookFailure = yield* runHookCommandsAllowFailure(
              systemCommands,
              repoConfig.hooks.preStart,
              workingDirectory,
            );
            if (hookFailure) {
              return yield* Effect.fail(
                new HostOperationError({
                  operation: "workspaceSession.preStart",
                  message: `Workspace Session pre-start hook failed: ${hookFailure.hook}\n${hookFailure.stderr}`,
                }),
              );
            }
            const canonicalPath = yield* git.canonicalizePath(workingDirectory);
            return yield* use(
              { kind: "local_worktree", workingDirectory: canonicalPath },
              retainTarget,
            );
          }),
        ),
      );
      if (Exit.isSuccess(result)) return result.value;
      if (retained) return yield* Effect.failCause(result.cause);

      const cleanup = yield* Effect.exit(
        Effect.gen(function* () {
          if (yield* git.isRegisteredWorktree(repoPath, workingDirectory)) {
            yield* git.removeWorktree(repoPath, workingDirectory, true);
          }
          if (yield* settingsConfig.pathExists(workingDirectory)) {
            if (!(yield* worktreeFiles.pathIsWithinRoot(namespace, workingDirectory))) {
              return yield* Effect.fail(
                new HostValidationError({
                  message: `Cannot clean Workspace Session directory outside its namespace: ${workingDirectory}`,
                  field: "workingDirectory",
                }),
              );
            }
            yield* worktreeFiles.removePathIfPresent(workingDirectory);
          }
          if (yield* git.referenceExists(repoPath, `refs/heads/${branch}`)) {
            yield* git.deleteLocalBranch(repoPath, branch, true);
          }
        }),
      );
      if (Exit.isFailure(cleanup)) {
        return yield* Effect.fail(
          new HostOperationError({
            operation: "workspaceSession.create.cleanup",
            message: `Workspace Session creation failed: ${Cause.pretty(result.cause)}\nGit cleanup also failed: ${Cause.pretty(cleanup.cause)}`,
            cause: { creation: result.cause, cleanup: cleanup.cause },
          }),
        );
      }
      return yield* Effect.failCause(result.cause);
    }),
  );
