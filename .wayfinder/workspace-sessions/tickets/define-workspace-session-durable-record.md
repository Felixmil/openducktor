---
id: define-workspace-session-durable-record
title: Define the durable Workspace Session record
type: grilling
status: closed
assignee: null
labels: ["wayfinder:grilling"]
parent: ../map.md
blocked_by: ["define-agent-role-prompt-composition", "define-workspace-session-product-lifecycle", "define-global-custom-role-catalog", "define-workspace-session-local-worktree-lifecycle"]
---

## Question

What metadata, constraints, indexes, ownership rules, and typed ports belong in the dedicated workspace-database table for Workspace Sessions, while excluding transcripts, pending input, live routes, and other runtime-owned state?

## Decisions captured

- Each Workspace Session row has a generated OpenDucktor ID and stores `runtimeKind` and `externalSessionId`. Their combination uniquely identifies the runtime session within the workspace database.
- The row does not store `repoPath`, `taskId`, `runtimeId`, runtime routes, endpoints, transports, transcripts, pending input, or live runtime status.
- The row stores the last model selection accepted by the runtime, including provider, model, optional variant, and optional Runtime Profile ID, just as Task-bound Session records do. It never stores the runtime-owned Profile prompt.
- The row stores the immutable Workspace Session Role Snapshot confirmed by the custom Role catalog decision.
- The row stores `createdAt`, `updatedAt`, and nullable `archivedAt`. A null `archivedAt` means active. Running, stopped, idle, and error states remain runtime-owned.
- The row stores `generatedTitle` and nullable `manualTitle`. OpenDucktor derives `generatedTitle` programmatically from the first user prompt. Users may rename the session by setting `manualTitle`, which takes priority in the UI. A future design may replace programmatic generation with an LLM.
- Active sessions sort by `updatedAt` descending. Archived sessions sort by `archivedAt` descending.
- The table stores normal columns for identity, titles, and timestamps, plus nullable JSON values for the Role snapshot and selected model. The Role snapshot has no catalog foreign key.
- The unique runtime-session index covers `runtimeKind` and `externalSessionId`. It does not include the working directory.
- A separate `WorkspaceSessionStorePort` owns Workspace Session persistence while its SQLite adapter uses the same physical workspace database and connection management as tasks.
- The persisted primitive `workingDirectory` is replaced by an immutable `ExecutionTarget` used only by Workspace Session domain and storage contracts. Runtime adapters and Task-bound Session contracts continue to receive a plain working directory.
- `generatedTitle` remains null until the runtime accepts the first user message. The UI displays `Untitled session` before then. OpenDucktor generates the title once from the visible message parts, collapses whitespace, limits it to 40 characters, cuts at a word boundary when possible, and adds `…` when truncated. References use their visible labels, and attachments use their filenames.
- A manual title is not unique. OpenDucktor trims it, collapses whitespace, and limits it to 120 characters. Clearing it sets `manualTitle` to null and reveals the generated title. The later approved restore-only History decision supersedes archived-session renaming in the UI; users restore before opening or renaming a session.
- `updatedAt` records the latest conversation activity. OpenDucktor sets it when the runtime accepts a user prompt, then sets it once more when the session becomes idle if the last final assistant message has a later timestamp. Streaming assistant parts, duplicate times, and older times do not cause database writes. If idle has no final assistant message, including after a user stops a running session to archive it, the accepted prompt time remains.
- `ExecutionTarget` is a strict union of `{ kind: "local_repo_root", workingDirectory }` and `{ kind: "local_worktree", workingDirectory }`. Both variants store a canonical absolute path. The local-worktree variant does not store its initial branch because users and agents may change branches after creation.
- `WorkspaceSessionStorePort` exposes named reads for one session, active sessions, and archived sessions. It exposes named writes for create, rename, archive, restore, selected-model changes, generated-title changes, and activity recording. It does not expose a generic record patch.
- One `recordActivity` operation accepts the activity type and occurrence time. The first release supports `user_message` and `assistant_response`; the operation moves `updatedAt` forward only.
- Duplicate OpenDucktor IDs and duplicate `(runtimeKind, externalSessionId)` identities fail. Missing records fail with a typed resource error. Archive, restore, rename, selected-model, and generated-title writes are idempotent.
- `generatedTitle` may change after its first value. The first release sets it from the first accepted user message, and a future title generator may replace it as the conversation evolves. Changing it does not count as conversation activity.
- `setGeneratedTitle` accepts a non-empty string of at most 40 characters and may replace an existing generated title. It does not trim, collapse whitespace, or apply other normalization. Only a session that has never received a generated title may have null.
- Workspace Sessions reuse the existing `AgentSessionModelSelection` contract, including its `runtimeKind`. Contract validation rejects a selected model whose `runtimeKind` differs from the Workspace Session's top-level `runtimeKind`.
- `listActive` returns every active Workspace Session ordered by `updatedAt` descending. `listArchived` returns at most the 100 most recently archived sessions ordered by `archivedAt` descending. The first release has no pagination.
- Archiving an active session sets `archivedAt`. Archiving an already archived session keeps its existing value. Restoring sets `archivedAt` to null, and restoring an active session changes nothing. A later archive sets a new timestamp. None of these operations changes `updatedAt`.
- SQLite enforces primary-key, nullability, and unique-index constraints, plus the indexes needed for active and archived ordering. Contract schemas validate runtime kinds, title lengths, JSON values, and timestamp data types. The table does not add cross-field timestamp comparisons or other SQL checks.
- Every successful write returns the current `WorkspaceSession` record, including an idempotent no-op.
- Active and archived list queries use only their confirmed timestamp sort. They do not add an ID or another tie-breaker.
- The port includes `findByRuntimeSession({ runtimeKind, externalSessionId })`, which returns a record or null. The first release need not call it; later runtime-session import may use it.
- The application generates the Workspace Session ID before it creates a worktree or runtime session and passes that ID to the store.

## Existing store rules to reuse

- The SQLite Task store already owns one managed Drizzle connection and migration stack per workspace database. The Workspace Session adapter should use that connection instead of opening a second connection.
- Host store ports return `Effect` values with typed validation, resource, operation, path, and dependency errors. `WorkspaceSessionStorePort` should follow the same error contract and must not hide invalid JSON or missing records with defaults.
- SQLite timestamps use integer milliseconds. JSON columns store schema-validated values as text.
- The current Task-bound `AgentSessionRecord` stores `runtimeKind` both as session identity and inside its nullable `selectedModel`. Reusing that model-selection contract requires both values to match.
