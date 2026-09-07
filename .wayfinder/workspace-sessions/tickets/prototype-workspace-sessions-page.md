---
id: prototype-workspace-sessions-page
title: Prototype the Workspace Sessions page interaction model
type: prototype
status: closed
assignee: codex
labels: ["wayfinder:prototype"]
parent: ../map.md
blocked_by: ["define-workspace-session-product-lifecycle", "define-global-custom-role-catalog", "define-runtime-reconciliation"]
---

## Question

What page structure outside Agent Studio lets users switch Workspace Sessions directly, see running status, and use the shared chat, while reserving the right side for future tools and keeping archives secondary?

## Prototype for review

The user rejected the standalone HTML because it did not resemble OpenDucktor. The [in-app prototype](http://localhost:65515/prototype/workspace-sessions?variant=D) uses the real AppShell, AgentChatSurface, and shared composer. Source lives in `packages/frontend/src/pages/workspace-sessions/workspace-sessions-prototype.tsx`. The route is development-only. Sample actions stay in memory and do not call runtime or task-store mutations.

- D is selected. Reuse Agent Studio's horizontal tab pattern and place it at the top of the page, without a page-title row.
- Each tab has Archive instead of Close. Do not add a separate open-tab subset or put Archive in the chat header.
- The tab bar has no New session plus button. History sits to the right of the tabs and directly opens the restore-only archived-session list. Remove the All sessions list button.
- Archive acts on the clicked tab, even when another tab is selected. A running session requires confirmation to stop and archive. Archiving an inactive tab does not switch the current chat.

The rejected layouts and variant switcher are removed from the current prototype. Creation uses a labeled dialog with name, one combined Runtime and Model picker, a separate Effort picker, optional custom Role, and work location. Reuse the existing shared ModelPicker. Catalogs and effort choices are sample data, not live runtime capabilities. Reload resets sample records. Workspace changes reset sample state; this prototype does not implement the approved durable cache contract.

The left sidebar adds Create task with a sticky-note-plus icon and New session with message-circle-plus, including compact buttons when collapsed. The installed Lucide version has no StickyNotePlus export, so the prototype composes StickyNote and Plus. In the prototype, these actions appear only on its development route. Create task opens the existing real task-creation dialog; New session opens the sample creation dialog. Global production wiring belongs in the implementation plan.

## Rejected options and constraints

- A adds a second left sidebar and is rejected.
- B requires list-to-chat navigation and is rejected because switching sessions takes too much effort.
- C occupies the right side and is rejected; future Git and file tools need that area.
- E's top overview and F's bottom bar are rejected. The user chose D and asked to reuse existing patterns.
- Active and archived peer tabs are rejected. The archive list must remain secondary and offer restoration without conversation viewing.

## Approval

The user approved the final in-app prototype and requested the specification. D, the revised creation dialog, sidebar creation actions, and right-aligned History form the approved interaction model. Do not treat the sample model catalog or prototype form defaults as changes to the approved creation contract. The consolidated requirements are in [the specification](../spec.md).

## Verification

Frontend typecheck, focused oxlint, and `git diff --check` pass for refined D. Browser checks confirmed creation opens a new sample tab with the selected runtime/model and effort, History opens the restore-only archive dialog, and both sidebar actions open their respective dialogs. The task dialog was closed without creating a real task. Earlier checks confirmed inactive-tab archive targets the correct session and preserves the selected conversation. This is throwaway UI code, not a verified feature implementation.

## Source archive

On 2026-09-08, the user approved archiving and removing the prototype. Both source files remain on local branch `archive/workspace-sessions-prototype` at commit `8db227532f5f90d9b2b351b4eeac913e74eb44f4`. The temporary route and prototype sidebar branches were removed from the implementation. The old review URL above is historical. The production page uses the approved D layout at `/workspace-sessions`; see [acceptance evidence](../acceptance.md).
