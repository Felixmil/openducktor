# Workspace Sessions acceptance evidence

Specification: [Workspace Sessions](spec.md). Validation date: 2026-09-08. This record distinguishes verified feature behavior from the installed Codex runtime limitation. It does not change the approved schema or scope.

## Verification

The full typecheck, lint, test, and build passed after the startup and popup fixes, acceptance-test additions, and prototype cleanup. The frontend suite passed 4,590 tests with no failures. Focused acceptance tests cover creation inputs, pending state, ordinary failure, dirty-checkout confirmation, both sidebar actions, cached Workspace returns, and database-load Retry.

The real backend at `http://localhost:53233/` was started by the user. OpenCode creation, a no-tools chat turn, and page reload/resume passed. Archive cancellation, stop-before-archive, restore without selection, Workspace isolation, light/dark rendering, and both collapsed sidebar actions passed. The browser report and screenshots are in `/tmp/odt-workspace-browser-50838/report.md`; the directory name records the earlier server port.

## Evidence by story

Paths below are relative to the repository. UI tests are under `packages/frontend/src/pages/workspace-sessions`; host lifecycle tests are under `packages/host/src/application/workspaces`.

| Story | Implementation | Acceptance evidence |
| --- | --- | --- |
| 1 | Host-owned `workspace-session-service.ts` creation with repository session scope | Service test creates a durable repository session; real OpenCode creation |
| 2 | `WorkspaceCreateActions` in expanded and compact sidebar | `workspace-create-actions.test.tsx` tests both modes; live buttons open the correct dialogs |
| 3 | Shared ModelPicker and separate Effort control | `workspace-session-create-dialog.test.tsx` verifies the exact selected model and Effort sent to the host; shared picker tests |
| 4 | Role ID and location collected by creation dialog; host snapshots the Role | Creation-dialog input test and service No Role/worktree tests |
| 5 | Typed host failures and creation error display | Collision/invalid-title/cleanup-error service tests; ordinary creation rejection test checks actionable error, retained inputs, enabled form, and no success callback |
| 6 | Every active durable record appears in the horizontal tab strip | `workspace-session-tabs.test.tsx` creates two records and targets each tab |
| 7 | Shared runtime activity projection | Records test retains shared live status and approvals during metadata changes; running-tab test |
| 8 | `WorkspaceSessionChat` composes shared chat and operations | Shared pending-input tests, chat Retry regression, and real OpenCode message/response |
| 9 | Shared model actions, runtime acceptance before durable selection write | Runtime-persistence test rejects failed model changes and saves accepted changes |
| 10 | Tabs above one chat, no right-side session list | Production page layout and browser screenshots |
| 11 | First accepted-message event generates the title once | Runtime-persistence title/duplicate-activity test |
| 12 | Active-session title input and named rename operation | Metadata UI failed-rename/draft-retention test; store title validation test |
| 13 | Active list ordered by `updatedAt` descending | SQLite store activity/order test |
| 14 | Rename, archive, and restore preserve activity time | SQLite title and archive-idempotency tests |
| 15 | Each tab owns its Archive action | Tab test archives the unselected record without changing selection |
| 16 | Running-session confirmation | Tab cancellation test and live Cancel then Stop and archive |
| 17 | Stop completes before the archive write | Service Stop-failure test and tab failure-retention test |
| 18 | Metadata-only History with Restore | Metadata UI restore-only and pending-control test; live History |
| 19 | Restore only changes active membership | Tab selection-preservation test, store identity test, and live restore |
| 20 | Workspace SQLite table and shared history hydration | Store connection-restart test; live OpenCode reload retained transcript and selection |
| 21 | Workspace Query keys, infinite cache retention, background refresh | QueryObserver cached-return test proves cached A/B data remains available while fresh reads are pending |
| 22 | Originating Workspace identity on reads, events, and writes | Query ownership and late-read tests; subscription ownership test; live Workspace switch |
| 23 | Blocking database-list error with Retry | Tab test distinguishes database failure from empty state and verifies explicit Retry |
| 24 | Durable membership survives runtime observation failure | Subscription stream-warning test and shared read-model fault handling; status does not come from the durable store |
| 25 | Missing live projection remains idle and uses shared history loading | Records omitted-session test; real OpenCode reload/resume. Codex limitation below |
| 26 | Shared history error and Retry | Real Codex failure and explicit Retry preserve the record and disabled composer; shared chat Retry tests |
| 27 | Target validation and no replacement runtime/session | Runtime-persistence tests reject mismatch, missing worktree, and archived records before runtime calls |
| 28 | Durable records alone determine membership | Runtime-persistence test does not import unknown runtime sessions |
| 29 | Global Custom Agent Role operations and Settings editor | Role validation, sorting, serialized-write, and command-contract tests |
| 30 | No Role precedes the sorted custom catalog | Creation-dialog test asserts No Role, Alpha, Zeta; host sorting test excludes Workflow Role catalog entries |
| 31 | Immutable stored Role snapshot | Creation service and resume/send tests retain the snapshot after catalog edits or deletion |
| 32 | Confirmed catalog deletion | Settings Role test requires confirmation before deletion |
| 33 | Runtime Profile selection remains separate and capability-gated | Creation-dialog test sends Runtime Profile and Custom Role separately; runtime adapter transport tests |
| 34 | Host-owned local worktree target | Service and real-Git integration tests start from committed HEAD |
| 35 | Typed dirty-checkout confirmation and explicit user action | Creation-dialog confirmation/Cancel test and real-Git dirty-file exclusion test |
| 36 | Existing copy-path and pre-start-hook setup | Real-Git integration test verifies copied setup file and hook output |
| 37 | Failed creation rolls back its Git resources | Service failure matrix plus real-Git startup-failure rollback test; cleanup errors remain visible |
| 38 | Archive/restore retain target, branch, and worktree | Real-Git lifecycle test and store archive/restore identity assertions |
| 39 | Shared trusted MCP policy with approval for mutations | OpenCode repository lifecycle test checks full trusted catalog and mutating `ask` rules; Codex policy lifecycle test |
| 40 | Semantic tokens, compact controls, bounded popup | Light/dark browser captures; compact sidebar tests and live dialogs; popup measured within a 577px viewport |
| 41 | Pending fieldset, read-only model picker, submit guard | Creation-dialog test checks exact inputs, whole-fieldset disablement, blocked Close, and duplicate-submit prevention |

## Installed Codex limitation

Codex CLI 0.153.4 creates the native session, then rejects its first paginated history read with `invalid paginated history lineage ... missing source rollout`. One explicit Retry returned the same error. The UI reports the failure and keeps the composer disabled. No error-suppressing fallback or runtime patch was added. The user explicitly requested that the installed runtime remain unchanged.

The local Codex source at commit `47ca4619b` routes paginated reads directly through the thread store, which requires a rollout before the normal unmaterialized-thread error mapping runs. This supports an upstream runtime diagnosis. The passing OpenCode smoke test supplies the spec's required real-runtime creation and resume evidence; it does not establish Codex success.

## Review

Independent frontend and backend reviews found no unresolved actionable defect. Their acceptance inventory identified missing focused UI tests; the additions above address creation, sidebar, cached-return, and database-failure cases. The final frontend review accepted the ordinary-error test and prototype cleanup and closed its last coverage finding. React Doctor reports 91/100 with two warnings: existing shared ModelPicker complexity and the shared read-model publication effect. The popup change adds no control-flow branch; the publication effect keeps the existing shared session store synchronized with its durable query input.

## Prototype archive

The user approved saving and removing the throwaway prototype. Its two source files remain on the local branch `archive/workspace-sessions-prototype`, commit `8db227532f5f90d9b2b351b4eeac913e74eb44f4`. This is a design-source archive, not a standalone runnable build. The implementation keeps the approved D layout and removes the temporary route and prototype sidebar branches.
