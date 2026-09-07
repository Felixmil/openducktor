---
id: define-agent-role-prompt-composition
title: Define Agent Role prompt composition
type: grilling
status: closed
assignee: codex
labels: ["wayfinder:grilling"]
parent: ../map.md
blocked_by: []
---

## Question

How should OpenDucktor pass an optional custom Agent Role prompt to a Workspace Session while keeping built-in Workflow Roles unavailable and leaving Runtime Profile prompt handling to the runtime?

## Resolution

Workspace Sessions and Task Workflow sessions use separate kinds of Agent Role. OpenDucktor must not offer the built-in Spec Agent, Planner Agent, Builder Agent, or QA Agent roles when a user creates a Workspace Session. Those built-in Workflow Roles remain task-only, and their current task-specific prompt composition does not need to become reusable for Workspace Sessions.

A Workspace Session may select one global custom Agent Role or no Agent Role. Each custom Agent Role contains one system prompt. When selected, OpenDucktor passes that prompt through the runtime's privileged system-prompt input. When no custom Agent Role is selected, OpenDucktor adds no Agent Role prompt.

Runtime Profile selection stays separate from Agent Role selection. OpenDucktor passes the Profile identifier only through the runtime-owned model selection input and never reads, stores, or combines the Profile prompt. The runtime combines its Profile prompt with the optional custom Agent Role system prompt.

The global catalog ticket will decide custom Agent Role identity, editing, deletion, ordering, and snapshot rules. It must not add built-in Workflow Roles to Workspace Sessions.
