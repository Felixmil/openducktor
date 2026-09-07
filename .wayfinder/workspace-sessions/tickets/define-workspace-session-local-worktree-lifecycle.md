---
id: define-workspace-session-local-worktree-lifecycle
title: Define local worktree execution for Workspace Sessions
type: grilling
status: closed
assignee: null
labels: ["wayfinder:grilling"]
parent: ../map.md
blocked_by: ["define-workspace-session-product-lifecycle"]
---

## Question

How should OpenDucktor create, identify, validate, retain, and report failures for a local worktree used as an immutable Workspace Session Execution Target, including its branch and start point, archive and restore behavior, missing paths, and any explicit cleanup action?

## Existing behavior we can reuse

- Task worktrees use the workspace's effective worktree base path, configured branch prefix, copy paths, and pre-start hooks.
- Task worktree setup validates Git ownership and branch state, and rolls back the worktree, branch, and tracking ref when setup fails.
- Task cleanup can remove a managed worktree and its branch, but Workspace Sessions do not yet have a cleanup product action.

## Decision

- Generate the Workspace Session ID before any Git operation.
- Put an OpenDucktor-created worktree at `<effectiveWorktreeBasePath>/workspace-sessions/<workspaceSessionId>` so it cannot collide with task worktrees and does not depend on a mutable title.
- Create an immutable branch name from the configured branch prefix and `session-<shortSessionId>`.
- Start the branch from the repository checkout's current committed `HEAD` in the first release. Do not copy uncommitted changes into the worktree.
- Reuse the workspace's configured copy paths and pre-start hooks. Treat all setup steps as one operation and roll back every created Git resource when any step fails.
- Archive leaves the worktree, its current branch, runtime-owned session, and `ExecutionTarget` in place. OpenDucktor first stops a running session after user confirmation, then changes only its archive metadata; restore reuses the same target and runtime-owned session.
- If the stored worktree path is missing or fails Git repository or registration validation, keep the durable record unchanged and surface an actionable error through the chat component. Never fall back to the repository root and never recreate the worktree automatically.
- Store only the canonical worktree directory in `ExecutionTarget`. The branch created during setup is not part of the durable target because users and agents may change it later.
- Do not expose worktree or branch cleanup in the first release. OpenDucktor retains both because the Workspace Session still refers to that immutable target and runtime session.
- When the repository checkout has uncommitted changes, warn that the new worktree starts from committed `HEAD` and excludes those changes, then let the user confirm or cancel creation.
- Treat an existing generated path or branch as an actionable collision error. Do not adopt it, modify it, or choose a different generated name.
