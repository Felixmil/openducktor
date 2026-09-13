import { z } from "zod";
import { runtimeQueryFailureSchema } from "./runtime-query-failure-schemas";
import { acceptedAgentUserMessageSchema } from "./agent-session-control-schemas";
import { agentSessionLiveRefSchema } from "./agent-session-schemas";
import { workspaceTextFileWriteFailureSchema } from "./filesystem-schemas";
import { sessionHistoryFailureSchema } from "./session-history-failure-schemas";
import { taskAssetFailureSchema } from "./task-asset-schemas";
import { terminalFailureSchema } from "./terminal-schemas";

export const hostInvokeFailureSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("workspace_session_validation"),
    field: z.enum(["worktree.name", "worktree.branchName"]),
  }),
  z.strictObject({
    kind: z.literal("agent_session_message_accepted"),
    sessionRef: agentSessionLiveRefSchema,
    acceptedMessage: acceptedAgentUserMessageSchema,
    stage: z.enum(["live_update", "record_message"]),
  }),
  z.strictObject({
    kind: z.literal("workspace_session_confirmation"),
    field: z.literal("confirmStop"),
  }),
  z
    .object({ kind: z.literal("runtime_query"), runtimeQueryFailure: runtimeQueryFailureSchema })
    .strict(),
  z
    .object({
      kind: z.literal("terminal"),
      terminalFailure: terminalFailureSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("task_asset"),
      taskAssetFailure: taskAssetFailureSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("session_history"),
      sessionHistoryFailure: sessionHistoryFailureSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("workspace_text_file_write"),
      workspaceTextFileWriteFailure: workspaceTextFileWriteFailureSchema,
    })
    .strict(),
]);
export type HostInvokeFailure = z.infer<typeof hostInvokeFailureSchema>;

export const hostErrorResponseSchema = z
  .object({
    error: z.string().trim().min(1).optional(),
    failure: hostInvokeFailureSchema.optional(),
    failureKind: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1).optional(),
  })
  .catchall(z.json());
export type HostErrorResponse = z.infer<typeof hostErrorResponseSchema>;
