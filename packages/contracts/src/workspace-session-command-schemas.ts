import { z } from "zod";
import { agentSessionControlSummarySchema } from "./agent-session-control-schemas";
import { runtimeKindSchema } from "./agent-runtime-schemas";
import { workspaceIdSchema } from "./config-schemas";
import { agentSessionModelSelectionSchema } from "./session-schemas";
import {
  WORKSPACE_SESSION_MANUAL_TITLE_LIMIT,
  workspaceSessionSchema,
} from "./workspace-session-schemas";

export const workspaceSessionListInputSchema = z.strictObject({ workspaceId: workspaceIdSchema });
export const workspaceSessionRefInputSchema = workspaceSessionListInputSchema.extend({
  sessionId: z.string().min(1),
});
export type WorkspaceSessionRefInput = z.infer<typeof workspaceSessionRefInputSchema>;

export const workspaceSessionCreateInputSchema = z
  .strictObject({
    workspaceId: workspaceIdSchema,
    runtimeKind: runtimeKindSchema,
    selectedModel: agentSessionModelSelectionSchema.nullable(),
    customAgentRoleId: z.string().min(1).nullable(),
    location: z.enum(["local_repo_root", "local_worktree"]),
    manualTitle: z.string().nullable(),
    confirmUncommittedChanges: z.boolean().default(false),
  })
  .refine(
    (input) =>
      input.selectedModel === null || input.selectedModel.runtimeKind === input.runtimeKind,
    {
      path: ["selectedModel", "runtimeKind"],
      message: "Model Runtime must match the Workspace Session Runtime.",
    },
  );
export type WorkspaceSessionCreateInput = z.infer<typeof workspaceSessionCreateInputSchema>;

export const workspaceSessionCreateResultSchema = z.strictObject({
  session: workspaceSessionSchema,
  runtimeSession: agentSessionControlSummarySchema,
});
export type WorkspaceSessionCreateResult = z.infer<typeof workspaceSessionCreateResultSchema>;

export const workspaceSessionRenameInputSchema = workspaceSessionRefInputSchema.extend({
  manualTitle: z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, " "))
    .pipe(z.string().max(WORKSPACE_SESSION_MANUAL_TITLE_LIMIT))
    .nullable(),
});
export const workspaceSessionArchiveInputSchema = workspaceSessionRefInputSchema.extend({
  confirmStop: z.boolean().default(false),
});
