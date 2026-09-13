---
id: workspace-sessions-spec
title: Workspace Sessions and custom Agent Roles
type: spec
status: open
labels: ["ready-for-agent"]
---

## Problem statement

Users need to discuss and work on a Repository without creating a Task or entering the Task Workflow. These conversations need a durable place in their Workspace. Users must be able to return after an app restart, switch conversations directly, and keep finished conversations out of the main view without deleting them.

Users also need reusable session instructions that do not carry the task-specific behavior of the built-in Workflow Roles. A later edit to those instructions must not change an existing conversation.

## Solution

Add a Workspace Sessions page outside Agent Studio. Each Workspace Session belongs to one Workspace and no Task. It uses the existing shared Agent Chat, runtime operations, and live session handling.

Show every active Workspace Session as a horizontal tab at the top of the page. Each tab has Archive instead of Close. History, at the right of the tabs, opens a secondary restore-only list. Add sidebar actions for Create task and New session. The creation dialog uses the shared combined Runtime and Model picker, a separate Effort picker, an optional Custom Agent Role, and a choice of the current Repository checkout or a new local worktree.

Store session metadata in the Workspace database. Keep transcripts and live interaction state runtime-owned. Users manage Custom Agent Roles in global Settings. Each session retains an immutable copy of its chosen Role and an immutable Execution Target.

## User stories

### Starting a conversation

1. As a user, I want to start a Workspace Session without a Task, so that I can discuss or change the Repository outside the Task Workflow.
2. As a user, I want separate Create task and New session sidebar actions, so that I can choose the correct kind of work directly.
3. As a user, I want one combined Runtime and Model picker and a separate Effort picker, so that creation follows the app's existing selection patterns.
4. As a user, I want to choose an optional Custom Agent Role and a work location, so that the session uses the instructions and directory I intend.
5. As a user, I want creation errors to identify the failed operation, so that I can correct the cause without an apparently successful but unusable session.

### Switching and chatting

6. As a user, I want all active Workspace Sessions in top-level horizontal tabs, so that I can switch directly without returning to a list.
7. As a user, I want running status on my sessions, so that I can see which conversations still have activity.
8. As a user, I want the existing Agent Chat controls, so that messages, Stop, approvals, questions, and supported runtime features work as they do elsewhere.
9. As a user, I want to change the Model and Effort through the shared chat controls, so that the stored selection reflects what the runtime accepted.
10. As a user, I want the right side left available for future Git and file tools, so that session navigation does not occupy that area.

### Naming and ordering

11. As a user, I want a title generated from my first accepted message, so that I can identify a session without naming it first.
12. As a user, I want to set or clear a manual title, so that I can override the generated title and later return to it.
13. As a user, I want recent conversations first, so that I can find the sessions I last used.
14. As a user, I want rename and archive actions not to count as conversation activity, so that list order reflects the conversation itself.

### Archiving and restoring

15. As a user, I want Archive on each session tab, so that I can remove that session from the active view without deleting its history.
16. As a user, I want a warning before archiving a running session, so that I can confirm that OpenDucktor will stop it first.
17. As a user, I want a failed Stop to prevent archive, so that OpenDucktor does not hide a session that it failed to stop.
18. As a user, I want History to show archived metadata with Restore only, so that archived conversations stay out of normal navigation.
19. As a user, I want restoration to retain the same runtime session and directory without restarting work or switching my current chat, so that I control when to resume.

### Returning to a Workspace

20. As a user, I want session metadata to survive an app restart, so that my Workspace Sessions remain available.
21. As a user, I want previously loaded session lists to appear immediately when I return to a Workspace, so that switching does not wait for another full load.
22. As a user, I want all reads and returned writes scoped to their originating Workspace, so that a late request never mixes conversations from different Workspaces.
23. As a user, I want a database load failure to appear as an error, so that it cannot look like an empty Workspace.
24. As a user, I want a runtime observation failure to keep my saved sessions visible with status unavailable, so that a runtime outage does not hide my session list.

### Runtime history and failures

25. As a user, I want saved sessions that are not currently live to remain openable, so that I can load their history and resume through the existing chat flow.
26. As a user, I want history errors and Retry in the shared chat, so that session failures behave the same across the app.
27. As a user, I want a missing runtime session or invalid directory to produce an error without replacement or fallback, so that OpenDucktor never continues in the wrong session or Repository.
28. As a user, I want unknown runtime sessions excluded from this page, so that only Workspace Sessions I created in OpenDucktor appear here.

### Custom Agent Roles

29. As a user, I want to create and edit Custom Agent Roles in global Settings, so that I can reuse a named system prompt across Workspaces.
30. As a user, I want No Role first and Custom Agent Roles in alphabetical order, so that I can find the intended option without built-in Workflow Roles in the list.
31. As a user, I want existing sessions to retain their original Role name and prompt after catalog edits or deletion, so that their instructions do not change unexpectedly.
32. As a user, I want confirmation before deleting a Custom Agent Role, so that I do not remove a reusable Role by mistake.
33. As a user, I want Runtime Profile selection to remain separate from Custom Agent Role selection, so that I can use supported runtime presets without OpenDucktor taking ownership of their prompts.

### Local worktrees

34. As a user, I want to create a session in a new local worktree, so that its work can stay separate from my current checkout.
35. As a user, I want a warning that uncommitted checkout changes will not enter the new worktree, so that I can confirm or cancel with that limit in mind.
36. As a user, I want new worktrees to use the Workspace's configured copy paths and pre-start hooks, so that they receive the same setup as other managed worktrees.
37. As a user, I want failed setup to roll back the Git resources it created, so that a failed creation does not leave a half-created worktree.
38. As a user, I want archive and restore to retain the worktree and its current branch, so that my files and execution location remain intact.

### Access and consistency

39. As a user, I want Workspace Sessions to retain the trusted OpenDucktor MCP tool set with approval for mutating tools, so that useful Repository work remains available without silently removing approval controls.
40. As a user, I want the page and dialogs to work in light and dark themes and with a collapsed sidebar, so that they match the rest of OpenDucktor.
41. As a user, I want creation to disable the form while pending and show actionable errors, so that repeated input cannot create unintended duplicate sessions.

## Implementation decisions

### Ownership and integration

1. A Workspace Session belongs to one Workspace and no Task. Reuse the existing repository member of `AgentSessionAssociation` and `agentSessionRepositoryScopeSchema`. Do not introduce a new runtime association for durable Workspace Sessions or change Task-bound Session contracts to use Execution Targets.
2. The page collects creation inputs. One host application operation owns ID generation, validation, Role lookup and snapshotting, Execution Target preparation, runtime startup, durable creation, and failure cleanup. The frontend must not coordinate these steps. Creation sends the optional Custom Agent Role ID, not a client-authored prompt snapshot. A missing Role is an error.
3. Add named Workspace Session product operations through the existing public Zod contracts, host application services, command routing, and host-client patterns. Keep persistence behind `WorkspaceSessionStorePort`. Host I/O uses Effect and typed errors. Keep Promise interop at existing external boundaries. Propagate failures without silent defaults, replacement sessions, alternate directories, or retry loops that mask broken contracts.
4. Extend the shared Agent Session operations and event handling for Workspace Session persistence. Reuse runtime control, approvals, questions, capabilities, transcript assembly, history loading, and status projection. Do not create a second chat, transcript cache, status cache, or page-specific reconciliation system.
5. Preserve trusted OpenDucktor MCP access and mutating-tool approval. Workspace Sessions do not acquire a Workflow Role or task-bound workflow identity. Runtime Profile prompts remain runtime-owned. Verify runtime-specific behavior against installed runtime source or its official contract during implementation.

### Durable record

1. Add a dedicated Workspace Session table in the existing workspace-scoped SQLite database, using the same managed Drizzle connection and migration system as tasks. The approved record contains the generated OpenDucktor ID, `runtimeKind`, `externalSessionId`, immutable `ExecutionTarget`, nullable Role snapshot, nullable selected model, nullable generated and manual titles, `createdAt`, `updatedAt`, and nullable `archivedAt`.
2. Use ordinary columns for identity, titles, and timestamps, schema-validated JSON for the structured values, and integer-millisecond timestamps. Enforce primary-key, required-value, and runtime-identity uniqueness constraints in SQLite. The unique runtime identity is `runtimeKind` plus `externalSessionId` within the Workspace database, without a working-directory component. Add indexes for the agreed active and archived ordering. Do not add extra timestamp comparisons or SQL checks.
3. Do not store `repoPath`, `taskId`, `runtimeId`, routes, endpoints, transports, runtime status, transcripts, pending permissions, pending questions, context use, or streaming state in this record. Workspace ownership comes from the Workspace database. The Role snapshot has no foreign key to the global catalog.
4. Reuse `AgentSessionModelSelection`, including provider, model, optional variant and Runtime Profile ID. Its `runtimeKind` must match the record. Persist only selections accepted by the runtime. The durable selection wins during reconciliation; a live selection may fill a null value in memory without causing a write. Chat model changes update the runtime first and persist after acceptance.
5. This spec records the human-approved dedicated record design. Do not extend other durable record shapes or add unrelated migrations as part of implementation. Any further durable schema change requires human validation.

### Persistence operations

1. `WorkspaceSessionStorePort` exposes named reads for one record, all active records, and archived records. Include `findByRuntimeSession` with runtime kind and external session ID, returning a record or null. This lookup does not authorize automatic import and need not have a first-release caller.
2. Expose named writes for create, rename, archive, restore, selected-model changes, generated-title changes, and activity recording. Do not expose a generic record patch. The application generates the ID before any Git or runtime creation.
3. Duplicate OpenDucktor IDs and duplicate runtime identities fail. Missing records produce typed resource errors. Rename, archive, restore, selected-model, and generated-title writes are idempotent. Every successful write returns the current record, including a no-op.
4. `listActive` returns every active record ordered by `updatedAt` descending. `listArchived` returns at most the 100 most recently archived records ordered by `archivedAt` descending. Neither query adds a tie-breaker or pagination.
5. Archiving an active record sets `archivedAt`. Repeating archive preserves that time. Restore clears it and is a no-op for an active record. A later archive gets a new time. Archive and restore never change `updatedAt`.

### Titles and activity

1. Before the first runtime-accepted user message, `generatedTitle` is null and the UI shows `Untitled session` unless a manual title exists. Generate the title once from the first accepted message's visible parts. Use reference labels and attachment filenames, collapse whitespace, and limit the complete title to 40 characters. Cut at a word boundary where possible and append `…` when truncated.
2. A manual title takes priority and need not be unique. Trim it, collapse whitespace, and limit it to 120 characters. Clearing it stores null and reveals the generated title. The optional creation name follows these same manual-title rules. Prototype sample defaults do not replace them.
3. The generated-title write accepts a non-empty string of at most 40 characters without further normalization. It may replace a prior value to leave room for a future generator, but the first release generates only from the first accepted message. A record that has received a generated title cannot return it to null. Title writes do not count as conversation activity.
4. `recordActivity` accepts the activity type and occurrence time. Support `user_message` and `assistant_response`, and move `updatedAt` forward only. Record accepted user prompts, then record the final assistant message time once the session becomes idle if that time is later. Streaming parts, duplicate times, and older times cause no activity write. If no final assistant message exists, retain the last accepted prompt time.
5. Rename belongs to active session use. The archived History dialog offers Restore only, with no rename or conversation-view action. This supersedes the earlier archived-renaming UI decision.

### Custom Agent Roles and Runtime Profiles

1. Manage one global Custom Agent Role catalog in Settings. Each Role has an immutable generated ID, a name, and one system prompt. Names must be unique after trimming and without regard to case. Editing retains the ID and affects future sessions only.
2. Selectors show `No Role` first and Custom Agent Roles alphabetically. Creation offers a route to the catalog in Settings. Do not offer Spec Agent, Planner Agent, Builder Agent, or QA Agent in Workspace Sessions.
3. A session retains an immutable snapshot of the selected Role ID, name, and system prompt. All three are absent when No Role is selected. The Role cannot change after creation. Runtime calls use this snapshot, not the current catalog entry, including when an idle session resumes.
4. Deleting a catalog Role requires confirmation and leaves existing snapshots intact. A later Role with the same name receives a new ID. The first release has no manual Role ordering, import, or export.
5. Pass the selected Custom Agent Role prompt through the runtime's privileged system-prompt input. With No Role, add no Agent Role prompt. Pass an optional Runtime Profile ID through runtime-owned model selection only. OpenDucktor must not read, store, or combine its prompt. Offer Profile selection only where supported; the agreed first-release context has this support in OpenCode.

### Execution Targets and creation failure

1. `ExecutionTarget` is an immutable strict union of `local_repo_root` and `local_worktree`, each with a canonical absolute `workingDirectory`. The worktree variant stores no branch name. Runtime adapters receive the resolved plain directory. No Task-bound Session migration to this value is part of the feature.
2. Generate the Workspace Session ID before Git operations. Create worktrees under the configured effective worktree base, in a `workspace-sessions` namespace keyed by the full session ID. Create the initial branch from the configured branch prefix and `session-<shortSessionId>`. Names do not depend on the mutable title.
3. Start from the current Repository checkout's committed `HEAD`. Do not copy its uncommitted changes. If such changes exist, warn and allow confirmation or cancellation. Reuse configured copy paths and pre-start hooks. An existing generated path or branch is a collision error; do not adopt it or silently choose a different name.
4. Treat setup as one host-owned operation and roll back every Git resource created by failed setup. Never delete a runtime-owned session. The implementation plan must make operation order and cleanup explicit within that constraint and report cleanup failures rather than hide them. Do not add a runtime-deletion compensation path.
5. Archive and restore retain the worktree, its current branch, runtime-owned session, and Execution Target. A missing directory or failed Repository or worktree-registration check leaves the durable record unchanged and produces an actionable chat error. Never fall back to the Repository root or recreate the worktree automatically. The first release has no worktree or branch cleanup action.

### Reconciliation, caching, and errors

1. Durable records determine Workspace Sessions page membership. Do not import or display unmatched runtime sessions. Match live data by runtime kind and external session ID, then check its directory against the stored target. A mismatch is a session error, not a second record or a target change.
2. A successful live snapshot that omits a durable session projects it as idle, listed, and openable. Opening loads runtime-owned history through the shared history path. Missing external history uses the existing chat error and Retry action. Such failures never archive, restore, delete, replace, or recreate the durable session.
3. Durable data owns titles, Role snapshots, archive state, and Execution Targets. Runtime data owns activity, pending input, context use, and transcripts. Use the same shared status projection everywhere Agent Sessions appear. If observation fails, retain durable records, show status unavailable and an error with Retry, and do not report sessions as running. Failure to load the durable list is a blocking page error.
4. TanStack Query owns active and archived durable reads, with keys scoped by Workspace identity and cache retention for the app-process lifetime. Show cached data immediately on return and refresh in the background. Successful mutations update or invalidate only the originating Workspace's cache. Do not add a second request cache or replace cached data with another Workspace's records.
5. Capture the Workspace and session identity before asynchronous work. Late list, history, runtime, or mutation results must not change a different Workspace's view. Use the existing shared stale-result and session-isolation mechanisms. Keep transcripts, pending input, and live event assembly in the existing shared session state, not a Workspace-specific transcript query.

### Page and lifecycle

1. Implement the approved in-app D layout with the real app shell and shared Agent Chat. Reuse Agent Studio's top horizontal-tab pattern without a page-title row, second left sidebar, list-to-chat navigation, or right-side session list. Every active session belongs in the tab strip; there is no separate open-tab subset.
2. Each tab has Archive instead of Close. Archive targets the clicked tab, including when another tab is selected. Archiving an unselected tab preserves the current chat. Archiving the selected tab selects another active session, or shows the empty state if none remain. Do not add a second Archive action to the chat header or a New session plus button to the tab bar.
3. History sits to the right of the tabs and opens archived metadata with Restore only. Users must restore before reading or sending. Restore does not select that session, switch the current chat, or restart work. It makes the same session available in the active tabs.
4. A running session requires a warning and confirmation before archive. Stop the runtime before writing archive metadata. If Stop fails, show its error and do not archive. Stop by itself never archives. Runtime activity and load failures never archive automatically. OpenDucktor never deletes a runtime-owned session.
5. Add global sidebar Create task and New session actions, including collapsed-sidebar controls. Use the requested sticky-note-plus and message-circle-plus visuals through the existing icon system. Create task opens the existing task dialog. New session opens the session creation dialog with optional name, shared combined Runtime and Model selection, separate supported Effort selection, optional Custom Agent Role, and current-checkout or new-worktree choice. Use actual capabilities and catalogs, disable the full form while pending, and preserve loading and error feedback. Use project shadcn components and semantic tokens in both themes.

## Testing decisions

1. Test public behavior at the highest existing interfaces that can prove it. Prefer the host application and command boundary for lifecycle behavior, and the existing shared session hooks and components for UI behavior. Do not add production options or exports solely for tests, a separate test runner, or a Workspace-specific test framework.
2. Test host creation and persistence with the real workspace SQLite adapter and disposable Repository/worktree fixtures. Use controlled fakes at existing runtime ports. Cover restart persistence, duplicate identities, validation, Role snapshot retention, workspace separation, model acceptance ordering, title rules, monotonic activity, archive idempotency, stop-before-archive, Stop failure, worktree setup and rollback, collisions, and invalid targets. Assert records, returned errors, runtime calls, and Git resources rather than private call structure. Reuse node host-command router tests and the shared SQLite store-port contract test pattern. Add focused store contract cases where host commands do not expose an approved port guarantee.
3. Test shared session reconciliation and frontend behavior with isolated TanStack Query clients and minimal required providers. Reuse Agent Session live-projection and shared Agent Chat model tests. Cover cached returns, background refresh, stale results after Workspace or session switching, durable-load failure, observation failure, absent live sessions, directory mismatch, history Retry, and exclusion of unknown runtime sessions. Verify that no failure changes archive state or selects a fallback runtime directory.
4. Test visible UI behavior with focused component or hook tests. Cover creation input and pending state, capability-driven Runtime/Model/Effort choices, immutable Role behavior, global catalog validation and deletion, correct-tab archive, running confirmation and cancellation, Stop failure, restore-only History, selection preservation, and both sidebar actions. Avoid broad page mocks, shared mutable test clients, and process-wide module-mock cleanup. Keep ordinary unit and hook tests fast without increasing timeouts to hide failures.
5. Run a browser smoke test against the real backend started by the user. Create and resume a real Workspace Session, exercise archive and restore, switch Workspaces, check the creation dialog and sidebar, and inspect light and dark themes. Verify a supported runtime's Role prompt and approval behavior through its existing integration boundary. Prototype sample interactions are design evidence, not proof that runtime persistence or recovery works.

## Out of scope

1. Task-bound Custom Workflow Roles, changes to built-in Workflow Role prompts, or turning a Workspace Session into a Task Workflow session.
2. Docker, SSH, remote Execution Targets, arbitrary existing-worktree adoption, copying uncommitted checkout changes, or automatic recreation of missing targets.
3. Transcript or live interaction persistence in the Workspace database, automatic runtime-session import, replacement-session recovery, runtime-session deletion, or worktree/branch cleanup.
4. A new session fork action, separate closed-tab state, archived conversation viewing, automatic archive, restore-on-send, search/filter/bulk-cleanup features, pagination, Role import/export, or manual Role ordering.
5. LLM title generation, future right-side Git/file tools, a new multi-window concurrency system, or application implementation as part of this specification-writing task.

## Further notes

The user approved the final in-app prototype and asked to proceed to the specification. The prototype records layout and interaction choices only. Its sample catalogs, sample messages, temporary route, and memory-only storage are not production requirements.

This specification consolidates the closed product, Role, worktree, record, reconciliation, and integration decisions. The latest restore-only History and final tab/sidebar decisions take priority over superseded prototype options and older archive behavior.

The implementation plan remains a separate deliverable. It must resolve exact command names, module placement, dependency order, creation cleanup sequencing, and focused verification commands from the live code while preserving this contract. Follow the accepted Effect host, project-native Agent UI, and workspace-scoped SQLite architecture decisions.

The local specification carries `ready-for-agent`. External issue-tracker publication has not occurred because this task has no configured publication destination or tracker label mapping. No runtime, database, or production feature change is part of this document update.
