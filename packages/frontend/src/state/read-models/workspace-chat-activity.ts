import type { WorkspaceSession } from "@openducktor/contracts";
import { isAgentSessionActivityWorking } from "@/lib/agent-session-activity-state";
import { agentSessionIdentityKey } from "@/lib/agent-session-identity";
import type { RepositoryAgentSessionSummary } from "../agent-session-snapshots";
import {
  workspaceSessionIdentity,
  workspaceSessionTitle,
} from "../operations/agent-orchestrator/session-read-model/workspace-session-records";
import type { AgentActivitySessionItem, AgentActivitySummary } from "./agent-activity-read-model";

export const summarizeWorkspaceChatActivity = (
  sessions: RepositoryAgentSessionSummary[],
  records: WorkspaceSession[],
): AgentActivitySummary => {
  const recordsByIdentity = new Map(
    records
      .filter((record) => record.archivedAt === null)
      .map((record) => [agentSessionIdentityKey(workspaceSessionIdentity(record)), record]),
  );
  const activeSessions: AgentActivitySessionItem[] = [];
  const waitingForInputSessions: AgentActivitySessionItem[] = [];
  for (const session of sessions) {
    const { activityState } = session;
    if (activityState !== "waiting_input" && !isAgentSessionActivityWorking(activityState))
      continue;
    const record = recordsByIdentity.get(agentSessionIdentityKey(session));
    if (!record) continue;
    const item: AgentActivitySessionItem = {
      ...workspaceSessionIdentity(record),
      taskId: null,
      role: null,
      workspaceSessionId: record.id,
      taskTitle: workspaceSessionTitle(record),
      activityState,
      startedAt: session.startedAt,
    };
    if (activityState === "waiting_input") waitingForInputSessions.push(item);
    else activeSessions.push(item);
  }
  return {
    activeSessionCount: activeSessions.length,
    waitingForInputCount: waitingForInputSessions.length,
    activeSessions,
    waitingForInputSessions,
  };
};
