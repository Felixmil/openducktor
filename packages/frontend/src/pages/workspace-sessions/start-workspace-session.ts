import type { WorkspaceSessionRefInput } from "@openducktor/contracts";
import type { AgentSessionsStore } from "@/state/agent-sessions-store";
import { host } from "@/state/operations/host";
import {
  applyWorkspaceSessionRecords,
  workspaceSessionIdentity,
  workspaceSessionTitle,
} from "@/state/operations/agent-orchestrator/session-read-model/workspace-session-records";
import { createSessionMessagesState } from "@/state/operations/agent-orchestrator/support/messages";

export const startWorkspaceSession = async (
  input: WorkspaceSessionRefInput,
  store: AgentSessionsStore,
  isCurrent: () => boolean,
  start: typeof host.workspaceSessionStart = host.workspaceSessionStart,
) => {
  const result = await start(input);
  if (!isCurrent())
    throw new Error(
      "Workspace changed while starting the chat. Reopen the chat to send your draft.",
    );
  const identity = workspaceSessionIdentity(result.session);
  if (!identity)
    throw new Error("The host did not bind a runtime session. Retry sending your draft.");
  if (!result.runtimeSession) {
    store.commitSessionCollection((current) => ({
      collection: applyWorkspaceSessionRecords(current, [result.session]),
      result: undefined,
    }));
  } else {
    const current = store.getSessionSnapshot(identity);
    store.replaceSession({
      ...identity,
      sessionAssociation: { kind: "repository" },
      title: workspaceSessionTitle(result.session),
      status: "idle",
      livePresence: "present",
      startedAt: result.runtimeSession.startedAt,
      messages: createSessionMessagesState(identity.externalSessionId),
      runtimeStatusMessage: null,
      contextUsage: null,
      pendingApprovals: [],
      pendingQuestions: [],
      selectedModel: result.session.selectedModel,
      ...current,
      historyLoadState: "loaded",
    });
  }
  return { ...result, identity };
};
