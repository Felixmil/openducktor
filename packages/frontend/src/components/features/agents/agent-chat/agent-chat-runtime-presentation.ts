import {
  type RuntimeDescriptor,
  type RuntimeKind,
  toOpencodeExposedOdtToolIds,
} from "@openducktor/contracts";
import {
  isOdtWorkflowMutationToolName,
  normalizeOdtToolName,
  toOdtWorkflowToolDisplayName,
} from "@openducktor/core";
import { findRuntimeDefinition } from "@/lib/agent-runtime";
import type { AgentChatRuntimePresentation } from "./agent-chat.types";

export const resolveAgentChatRuntimePresentation = ({
  runtimeDefinitions,
  runtimeKind,
}: {
  runtimeDefinitions: RuntimeDescriptor[];
  runtimeKind: RuntimeKind | null;
}): AgentChatRuntimePresentation => {
  const runtimeDefinition = runtimeKind
    ? findRuntimeDefinition(runtimeDefinitions, runtimeKind)
    : null;
  const workflowToolAliasesByCanonical = runtimeDefinition?.workflowToolAliasesByCanonical;

  return {
    runtimeKind,
    presentToolCall: (toolName, displayLabel) => {
      const odtTool = normalizeOdtToolName(toolName, (canonical) => {
        if (runtimeKind === "opencode") return toOpencodeExposedOdtToolIds(canonical);
        if (runtimeKind === "claude") return [`mcp__openducktor__${canonical}`];
        return [];
      });
      if (odtTool === "odt_create_task" || odtTool === "odt_search_tasks") {
        const taskTool = odtTool === "odt_create_task" ? "create_task" : "search_tasks";
        return { kind: "task", displayName: taskTool, taskTool };
      }
      return {
        kind: isOdtWorkflowMutationToolName(toolName, workflowToolAliasesByCanonical)
          ? "workflow"
          : "regular",
        displayName:
          displayLabel?.trim() ||
          toOdtWorkflowToolDisplayName(toolName, workflowToolAliasesByCanonical),
      };
    },
    supportedApprovalReplyOutcomes:
      runtimeDefinition?.capabilities.approvals.supportedReplyOutcomes ?? null,
  };
};
