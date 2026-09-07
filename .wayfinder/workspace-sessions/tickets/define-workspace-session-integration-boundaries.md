---
id: define-workspace-session-integration-boundaries
title: Define Workspace Session integration boundaries
type: grilling
status: closed
assignee: null
labels: ["wayfinder:grilling"]
parent: ../map.md
blocked_by: ["define-agent-role-prompt-composition", "define-workspace-session-product-lifecycle", "define-workspace-session-durable-record", "define-runtime-reconciliation"]
---

## Question

Which contracts, host ports, application services, frontend queries, public session operations, and invalidation or event paths should own Workspace Session creation, reads, updates, archiving, restoration, and live projection without coupling the page to task workflow code?

## Existing integration evidence

- Runtime-facing session scope already distinguishes `workflow` from `repository`, while the wider session association also supports `unbound`. Shared send, stop, model, approval, question, live-event, status, and transcript paths operate on that wider association instead of importing Agent Studio page code.
- Durable Task-bound Session reads and writes currently travel through Task service commands and a task-scoped TanStack Query module. Their persistence policies run inside the shared frontend orchestrator but commit only sessions whose association is `workflow`.
- The shared send path resolves the runtime-facing session scope immediately before each runtime call. Idle Task-bound Sessions also rebuild their trusted system prompt before send, while current `repository` sessions add no prompt context.
- Live transcript events update the shared in-memory session store. Task-bound final session events can also request a durable write through the same event path; this is the existing seam where Workspace Session activity recording can join without adding a second transcript handler.
- Workspace configuration rejects two Workspace records that point at the same canonical Repository path, but durable Workspace Session query keys still need the confirmed Workspace identity so cached reads and returned writes cannot cross Workspace caches.

## Decisions captured

- Workspace Sessions use the existing `agentSessionRepositoryScopeSchema` and its existing `AgentSessionAssociation` union member. Do not add another association or runtime-scope type for durable Workspace Sessions.
- The Workspace Sessions page owns the user's selection of Execution Target, Runtime, Model, optional Custom Agent Role, and other creation inputs. It delegates creation to one host-side application operation.
- The host owns the rest of creation, including Workspace Session ID generation, input validation, Execution Target preparation, runtime startup, durable record creation, and rollback after failure. The page must not coordinate those steps.
- Expose named Workspace Session product operations through the existing contract, host command, host-client, and application-service patterns. Keep `WorkspaceSessionStorePort` behind the host application layer instead of exposing storage operations to the page.
- Scope Workspace Session reads and frontend query keys by Workspace identity. Keep loaded active and archived lists in TanStack Query for the app-process lifetime, refresh them through the same patterns as other stable host reads, and update or invalidate only the affected Workspace cache after writes.
- Reuse the existing shared Agent Session operations and live-event paths for runtime control, status, transcript, approvals, questions, and capability-driven chat behavior. Workspace Session code adds durable product operations but no parallel chat or live-session pipeline.
- Session creation sends only the optional Custom Agent Role ID. The host resolves that Role from the current global catalog and creates the immutable Workspace Session Role Snapshot. If the Role no longer exists, creation fails.
- The implementation plan will set exact command names, file placement, operation sequencing, cache-update mechanics, error types, and test seams from the live code. Those details are not separate product decisions for this ticket.
