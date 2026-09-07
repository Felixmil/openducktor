---
id: compile-build-ready-spec-and-plan
title: Compile the Workspace Sessions build-ready spec and plan
type: task
status: in_progress
assignee: codex
labels: ["wayfinder:task"]
parent: ../map.md
blocked_by: ["define-global-custom-role-catalog", "define-workspace-session-local-worktree-lifecycle", "define-workspace-session-durable-record", "define-runtime-reconciliation", "prototype-workspace-sessions-page", "define-workspace-session-integration-boundaries"]
---

## Question

Compile the closed decision tickets and linked prototype into one build-ready specification and dependency-ordered implementation task plan, without implementing application code.

## Progress

The [Workspace Sessions specification](../spec.md) consolidates the approved decisions and final prototype using the requested `to-spec` template. It includes 41 user stories, implementation decisions, test coverage, and exclusions, and carries the local `ready-for-agent` label.

The user delegated testing decisions to the agent. The spec uses existing host-command and shared-session test interfaces, with real SQLite/Git fixtures where needed and a real-backend browser smoke test.

The dependency-ordered implementation plan remains to be written. External publication remains pending because no issue-tracker destination or label mapping is configured for this task. Do not treat the local label as proof of external publication.
