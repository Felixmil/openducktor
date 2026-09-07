---
id: define-global-custom-role-catalog
title: Define the global custom Agent Role catalog
type: grilling
status: closed
assignee: codex
labels: ["wayfinder:grilling"]
parent: ../map.md
blocked_by: ["define-agent-role-prompt-composition"]
---

## Question

How should users create, name, edit, delete, order, and select global custom Agent Roles, and what role identity or prompt snapshot must an existing Workspace Session retain when a custom role changes? Built-in Workflow Roles remain unavailable to Workspace Sessions.

## Resolution

- Users manage one global custom Agent Role catalog in Settings.
- The Workspace Sessions page lets users select an optional custom Agent Role when they create a session and provides a button that opens Settings at the custom Agent Role catalog.
- A Workspace Session cannot change its Agent Role after creation. It permanently retains the custom Agent Role name and system prompt used at creation so later catalog edits cannot change the session system prompt or reduce prompt cache hits.
- Custom Agent Role names must be unique after trimming and without regard to letter case.
- Each custom Agent Role receives an immutable generated ID. Users may change its name and system prompt for future Workspace Sessions without changing its ID.
- Selectors show `No Role` first and custom Agent Roles in alphabetical order. The first release has no manual ordering.
- Users may delete a custom Agent Role from the catalog after confirmation. Existing Workspace Sessions remain unchanged, and a later Role created with the same name receives a new ID.
- Each Workspace Session stores an immutable Role snapshot containing the selected Role ID, name, and system prompt. All three fields are absent when the session has no Role. Runtime calls use this snapshot and never depend on the current catalog entry.
