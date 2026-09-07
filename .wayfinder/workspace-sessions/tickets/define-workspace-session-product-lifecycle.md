---
id: define-workspace-session-product-lifecycle
title: Define the Workspace Session product lifecycle
type: grilling
status: closed
assignee: codex
labels: ["wayfinder:grilling"]
parent: ../map.md
blocked_by: []
---

## Question

Which Workspace Session actions and states belong in the first release, including creation, active and archived lists, opening, in-chat actions, archiving, restoring, and runtime load failures?

## Resolution

- OpenDucktor never removes a Workspace Session from its runtime.
- Archiving is an OpenDucktor-owned state change. If the Workspace Session is running, OpenDucktor warns the user and stops it after confirmation before archiving it. The durable record and runtime-owned session remain; OpenDucktor never deletes the runtime session.
- Users must explicitly restore an archived Workspace Session before opening or reading its conversation or sending a message. This replaces the earlier open-while-archived and restore-on-send decisions after prototype feedback.
- The main Workspace Sessions list contains every non-archived session and shows which sessions are running. Users can open any listed session.
- An open Workspace Session uses the existing task-agnostic chat component and supports its capability-driven actions, including Stop. Stop affects current runtime activity only; it does not archive the Workspace Session or remove its record.
- Users archive sessions manually. Runtime activity, Stop, and load failures never archive a session automatically.
- A secondary button opens a list of archived session metadata with Restore actions only. Archived sessions have no peer tab beside active sessions and cannot be opened from this list.
- When the runtime cannot load a Workspace Session, the chat component displays the error. The Workspace Sessions page does not own separate load-error behavior, and OpenDucktor does not add a recovery workflow, replace the runtime session, or change the durable archive state.
- Users may rename a Workspace Session by setting a manual title, which takes priority over its generated title.
- The first release adds no separate Workspace Session fork, delete, or runtime-removal action. New Workspace Session actions beyond the existing chat component behavior, rename, manual archive, and restore are deferred.
