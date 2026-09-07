---
id: workspace-sessions
title: Plan Workspace Sessions and OpenDucktor Roles
type: map
status: open
labels: ["wayfinder:map"]
---

## Destination

Produce a build-ready specification and implementation task plan for durable Workspace Sessions and OpenDucktor-owned Agent Roles. All product, domain, storage, runtime, and page behavior decisions must be settled before handoff, and this effort must not implement the feature.

## Notes

Domain: OpenDucktor agent sessions, role prompts, runtime profiles, workspace-scoped SQLite storage, and the Workspace Sessions page. Each decision session must use the `grilling` and `domain-modeling` skills; page-behavior work must also use the `prototype` skill. When all decision tickets close, the final task may compile their answers into a linked build-ready specification and implementation task plan.

Fixed inputs: Agent Role is an OpenDucktor-owned session persona whose behavior is one system prompt. The built-in Spec Agent, Planner Agent, Builder Agent, and QA Agent roles are Workflow Roles and are available only in Task Workflow sessions. Workspace Sessions may select one global custom Agent Role or no Agent Role. Runtime Profile is runtime-owned, only OpenCode supports it today, and the runtime combines its Profile prompt with the optional custom Agent Role prompt. Workspace Sessions persist metadata in the workspace database, while transcripts and live interaction state remain runtime-owned. Workspace Sessions continue to receive the full trusted OpenDucktor MCP tool set with mutating-tool approval. The first release supports repository-root execution and OpenDucktor-created local worktrees through an immutable Execution Target.

## Decisions so far

- [Define Agent Role prompt composition](tickets/define-agent-role-prompt-composition.md): Workspace Sessions accept one optional custom Agent Role prompt, never a built-in Workflow Role, and leave Runtime Profile prompt composition to the runtime.
- [Define the Workspace Session product lifecycle](tickets/define-workspace-session-product-lifecycle.md): OpenDucktor lists active sessions, reuses the task-agnostic chat component and its error handling, and supports manual archive plus a secondary restore-only list. Users must restore archived sessions before opening them. Runtime-owned sessions remain intact.
- [Define the global custom Agent Role catalog](tickets/define-global-custom-role-catalog.md): Users manage global custom Roles in Settings, each Role has a stable generated identity, and each Workspace Session keeps an immutable snapshot of its selected Role.
- [Define local worktree execution for Workspace Sessions](tickets/define-workspace-session-local-worktree-lifecycle.md): OpenDucktor creates stable session-ID worktrees and initial branches from committed `HEAD`, stores only the worktree directory as its immutable target, reuses workspace setup rules, retains worktrees through archive and restore, and fails without fallback when their stored directory identity is invalid.
- [Define the durable Workspace Session record](tickets/define-workspace-session-durable-record.md): A dedicated table stores session identity, immutable execution and Role data, mutable titles and selected model, activity and archive times, and no runtime-owned live state. A separate Effect port uses named operations on the shared workspace database.
- [Define durable and live Workspace Session reconciliation](tickets/define-runtime-reconciliation.md): Workspace Session records plug into the existing Agent Session projection, status, transcript, history, and error paths. Durable lists stay cached by Workspace, runtime state remains live, and failures never change durable records.
- [Define Workspace Session integration boundaries](tickets/define-workspace-session-integration-boundaries.md): The page selects creation inputs, one host application operation owns creation and rollback, named product operations follow existing host patterns, and the existing repository session scope and shared Agent Session pipeline remain unchanged.
- [Prototype Workspace Sessions](tickets/prototype-workspace-sessions-page.md): The user approved D and the final creation dialog. Reuse Agent Studio-style tabs at the top, Archive on each tab, History at the right for restore-only archives, and no plus button in the tab bar. Sidebar creation actions use sticky-note-plus for tasks and message-circle-plus for sessions. Use one combined runtime/model picker and a separate effort picker.

## Deliverables

- [Workspace Sessions specification](spec.md): Written from the approved decisions and prototype, with the local `ready-for-agent` label. External issue-tracker publication remains pending configuration.
- The dependency-ordered implementation plan remains open in [the compilation ticket](tickets/compile-build-ready-spec-and-plan.md).

## Not yet specified

- Retention, import, export, and migration rules for global custom Agent Roles may need their own decisions after the catalog lifecycle is known.
- Session naming and ordering are specified. Search, filtering, and bulk cleanup remain outside the first release.
- Multi-window database events and concurrent edits may need a separate decision after the durable record write model is fixed.
- The exact split of implementation tasks will be set only after storage, runtime reconciliation, and page boundaries are known.

## Out of scope

- Implementing application code, database migrations, or UI in this Wayfinder effort.
- Persisting transcripts, pending permissions, pending questions, live runtime routes, tool streaming state, or other runtime-owned interaction state.
- Task-bound custom Workflow Roles.
- Docker, SSH, and other non-local Execution Targets.
