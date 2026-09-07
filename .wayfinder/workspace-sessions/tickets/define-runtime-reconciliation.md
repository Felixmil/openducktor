---
id: define-runtime-reconciliation
title: Define durable and live Workspace Session reconciliation
type: grilling
status: closed
assignee: null
labels: ["wayfinder:grilling"]
parent: ../map.md
blocked_by: ["define-workspace-session-product-lifecycle", "define-workspace-session-durable-record"]
---

## Question

How should OpenDucktor combine durable Workspace Session records with runtime discovery, activity, and history while keeping live state runtime-owned? The chat component must display runtime load errors, and a load failure must not trigger automatic recovery, replacement, archival, or durable deletion.

## Existing behavior and constraints

- Persisted Task-bound Session records seed frontend session state, then authoritative runtime snapshots overlay activity, pending input, context use, runtime status, and transcript events.
- The live projection retains Task-bound Sessions without a live snapshot because their durable Task record still exists. It removes other non-starting sessions when a runtime snapshot omits them.
- The shared history loader stores a typed `SessionHistoryFailure`; the chat component renders the failure and can offer Retry.
- The current frontend session identity contains `runtimeKind`, `externalSessionId`, and `workingDirectory`. The confirmed Workspace Session database identity contains only `runtimeKind` and `externalSessionId`; its immutable `ExecutionTarget` separately supplies the expected directory.
- Runtime snapshots include a runtime title, model, association, directory, activity, pending input, and context use. Workspace Sessions instead own their display titles, Role snapshot, and Execution Target in the workspace database.

## Decisions captured

- Extend the existing Task-session reconciliation mechanism with Workspace Session records. Do not create a separate page-specific reconciliation system.
- Durable Workspace Session records define page membership. Runtime sessions without a matching durable record do not appear as Workspace Sessions and are not imported automatically.
- Match a durable record to runtime state by `runtimeKind` and `externalSessionId`, then compare the runtime working directory with `ExecutionTarget.workingDirectory`. A mismatch is a session error. It does not create a second Workspace Session, change the target, or cause fallback behavior.
- When a runtime does not report a durable Workspace Session as live, project the session as idle. Keep it listed and openable.
- Opening an idle Workspace Session loads its history from the runtime through the existing shared chat history path. If the runtime session was removed outside OpenDucktor, the history load fails and the chat component displays its existing error and Retry action.
- A history load failure does not archive, restore, delete, import, recreate, or otherwise change the durable Workspace Session record.
- The durable record owns the Workspace Session title, Role snapshot, archive state, and Execution Target. Runtime data owns current activity, pending input, context use, and transcript data. Reconciliation combines these fields without treating either source as a replacement for the other.
- The durable selected model wins when present. A live runtime model may fill a null model in memory, but passive reconciliation does not persist it. A model change from the chat updates the runtime first and persists the accepted model only after success.
- Archiving a running Workspace Session requires confirmation that OpenDucktor will stop it. OpenDucktor stops the runtime session before it writes `archivedAt`; it never keeps a running session hidden in the archived list.
- If OpenDucktor cannot read Workspace Sessions from the workspace database, the page displays a blocking load error.
- If the stop command fails, OpenDucktor does not archive the session and displays the stop error.
- Every page that displays Agent Sessions uses the same partial-failure rule. When durable Workspace Sessions load but runtime observation fails, keep the durable list visible, show that runtime status is unavailable, display an error with Retry, and do not mark any session as running.
- All durable Workspace Session reads and query keys are scoped by Workspace identity. A result for one Workspace may populate only that Workspace's cache and must never update another Workspace's UI.
- Keep loaded Workspace Session records in the query cache so returning to a Workspace can show them at once. Activation may refresh that Workspace's data without replacing it with records from the previously active Workspace.
- Keep each Workspace's durable Workspace Session lists in the query cache for the lifetime of the app process. Show cached records at once on return and refresh that Workspace in the background.
- Reuse the existing shared Agent Session status projection exactly. Workspace Sessions do not add a status cache, status rules, or a separate runtime comparison path.
- Reuse the existing task-agnostic transcript state, history loading, live events, and chat error handling. Workspace Sessions do not add a per-Workspace transcript query or a second transcript cache.
