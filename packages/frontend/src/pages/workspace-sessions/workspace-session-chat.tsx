import type { ChatSettings, ReusablePrompt, WorkspaceSession } from "@openducktor/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgentChatSurface } from "@/components/features/agents/agent-chat/agent-chat";
import { deriveAgentChatReadiness } from "@/components/features/agents/agent-chat/agent-chat-readiness";
import { resolveAgentChatRuntimePresentation } from "@/components/features/agents/agent-chat/agent-chat-runtime-presentation";
import { resolveAgentChatTranscriptPresentation } from "@/components/features/agents/agent-chat/agent-chat-transcript-presentation";
import { useAgentChatSurfaceModel } from "@/components/features/agents/agent-chat/use-agent-chat-surface-model";
import { useAgentSessionApprovalActions } from "@/components/features/agents/agent-chat/use-agent-session-approval-actions";
import { useAgentSessionQuestionActions } from "@/components/features/agents/agent-chat/use-agent-session-question-actions";
import { useSelectedSessionContextUsage } from "@/features/agent-chat-composer/context-usage/use-selected-session-context-usage";
import { resolveChatComposerPromptInputRuntime } from "@/features/agent-chat-composer/prompt-input/chat-composer-prompt-input-runtime";
import { createChatComposerFileSearch } from "@/features/agent-chat-composer/prompt-input/create-chat-composer-file-search";
import { resolveRuntimePromptInputSupport } from "@/features/agent-chat-composer/prompt-input/runtime-prompt-input-support";
import { useChatComposerSkills } from "@/features/agent-chat-composer/prompt-input/use-chat-composer-skills";
import { useChatComposerSlashCommands } from "@/features/agent-chat-composer/prompt-input/use-chat-composer-slash-commands";
import { useChatComposerSubagents } from "@/features/agent-chat-composer/prompt-input/use-chat-composer-subagents";
import {
  getAgentSessionActivityStateFromSession,
  isAgentSessionActivityWorking,
} from "@/lib/agent-session-activity-state";
import { agentSessionIdentityKey } from "@/lib/agent-session-identity";
import { getAgentSessionWaitingInputPlaceholder } from "@/lib/agent-session-waiting-input";
import { errorMessage } from "@/lib/errors";
import { repoRuntimeReadinessTargetForRuntime } from "@/lib/repo-runtime-readiness";
import { useRepoRuntimeReadiness } from "@/lib/use-repo-runtime-readiness";
import { resolveAgentStudioSendDraftParts } from "@/pages/agents/session-actions/agent-studio-send-draft";
import { useRuntimeAvailabilityContext } from "@/state/app-state-contexts";
import {
  useAgentOperations,
  useAgentSession,
  useAgentSessionReadModelState,
} from "@/state/app-state-provider";
import { useSelectedSessionContextLoad } from "@/state/operations/agent-orchestrator/history/use-selected-session-context-load";
import { useSelectedSessionHistoryLoad } from "@/state/operations/agent-orchestrator/history/use-selected-session-history-load";
import { useSessionRuntimeData } from "@/state/operations/agent-orchestrator/hooks/use-session-runtime-data";
import {
  workspaceSessionIdentity,
  workspaceSessionTitle,
} from "@/state/operations/agent-orchestrator/session-read-model/workspace-session-records";
import {
  deriveLoadedAgentSessionTranscriptState,
  derivePendingSelectedSessionTranscriptState,
} from "@/state/operations/agent-orchestrator/transcript/session-transcript-state";
import { runtimeCatalogQueryKeys } from "@/state/queries/runtime-catalog";
import type { ActiveWorkspace } from "@/types/state-slices";
import { useWorkspaceSessionModelPicker } from "./use-workspace-session-model-picker";

export function WorkspaceSessionChat({
  workspace,
  record,
  chatSettings,
  reusablePrompts,
}: {
  workspace: ActiveWorkspace;
  record: WorkspaceSession;
  chatSettings: ChatSettings;
  reusablePrompts: ReusablePrompt[];
}) {
  const identity = useMemo(() => workspaceSessionIdentity(record), [record]);
  const sessionKey = agentSessionIdentityKey(identity);
  const session = useAgentSession(identity);
  const operations = useAgentOperations();
  const readModel = useAgentSessionReadModelState();
  const runtime = useRuntimeAvailabilityContext();
  const queryClient = useQueryClient();
  const runtimeReadiness = useRepoRuntimeReadiness({
    hasWorkspace: true,
    runtimeTarget: repoRuntimeReadinessTargetForRuntime(record.runtimeKind),
  });
  const selectedModel = record.selectedModel ?? session?.selectedModel ?? null;
  const runtimeData = useSessionRuntimeData({
    repoPath: workspace.repoPath,
    selectedSession: { identity, selectedModel, sessionAssociation: { kind: "repository" } },
    runtimeDefinitions: runtime.allRuntimeDefinitions,
    repoReadinessState: runtimeReadiness.state,
    loadRuntimeCatalog: runtime.loadRepoRuntimeCatalog,
    readSessionTodos: operations.readSessionTodos,
  });
  useSelectedSessionHistoryLoad({ session, repoReadinessState: runtimeReadiness.state });
  const contextError = useSelectedSessionContextLoad({
    session,
    repoReadinessState: runtimeReadiness.state,
  });
  const picker = useWorkspaceSessionModelPicker(workspace.repoPath, {
    identity,
    selection: selectedModel,
    catalog: runtimeData.modelCatalog,
    isLoading: runtimeData.isLoadingModelCatalog,
    error: runtimeData.catalogError,
    retry: () =>
      queryClient.invalidateQueries({
        queryKey: runtimeCatalogQueryKeys.repo(workspace.repoPath, record.runtimeKind),
      }),
    update: operations.updateAgentSessionModel,
  });
  const promptInputRuntime = useMemo(
    () =>
      resolveChatComposerPromptInputRuntime({
        workspaceRepoPath: workspace.repoPath,
        repoReadinessState: runtimeReadiness.state,
        source: { kind: "session", session: identity },
      }),
    [identity, runtimeReadiness.state, workspace.repoPath],
  );
  const support = resolveRuntimePromptInputSupport({
    runtimeDefinitions: runtime.allRuntimeDefinitions,
    runtimeKind: record.runtimeKind,
  });
  const slashCommands = useChatComposerSlashCommands({
    promptInputRuntime,
    runtimeSupportsSlashCommands: support.runtimeSupportsSlashCommands,
    reusablePrompts,
    loadSlashCommandsForRepo: runtime.loadRepoRuntimeSlashCommands,
  });
  const skills = useChatComposerSkills({
    promptInputRuntime,
    supportsSkillReferences: support.supportsSkillReferences,
    loadSkillsForRepo: runtime.loadRepoRuntimeSkills,
  });
  const subagents = useChatComposerSubagents({
    promptInputRuntime,
    supportsSubagentReferences: support.supportsSubagentReferences,
    loadSubagentsForRepo: runtime.loadRepoRuntimeSubagents,
  });
  const searchFiles = useMemo(
    () =>
      createChatComposerFileSearch({
        promptInputRuntime,
        supportsFileSearch: support.supportsFileSearch,
        queryClient,
        loadFileSearchForRepo: runtime.loadRepoRuntimeFileSearch,
      }),
    [
      promptInputRuntime,
      queryClient,
      runtime.loadRepoRuntimeFileSearch,
      support.supportsFileSearch,
    ],
  );
  const contextUsage = useSelectedSessionContextUsage({
    selectedSession: session,
    sessionModelCatalog: runtimeData.modelCatalog,
    selectedModelEntry: picker.selectedModelEntry,
  });
  const observationReady = readModel.sessionReadModelLoadState.kind === "ready";
  const fault = readModel.getSessionFault(identity);
  const targetFault = fault?.source === "workspace-target" ? fault : null;
  const activityState =
    session && observationReady ? getAgentSessionActivityStateFromSession(session) : null;
  const isWorking = isAgentSessionActivityWorking(activityState);
  const transcriptState = session
    ? deriveLoadedAgentSessionTranscriptState({
        session,
        repoReadinessState: runtimeReadiness.state,
      })
    : derivePendingSelectedSessionTranscriptState({
        readModelLoadState: readModel.sessionReadModelLoadState,
        repoReadinessState: runtimeReadiness.state,
      });
  const readiness = deriveAgentChatReadiness({
    transcriptState,
    runtimeReadiness,
    runtimeBlockedAction: {
      label: "Recheck",
      onAction: () => void runtimeReadiness.refreshChecks(),
    },
    failedTranscriptAction: {
      label: "Retry",
      onAction: () => void operations.loadAgentSessionHistory(identity),
    },
  });
  const canInteract = readiness.interactionEnabled && observationReady && !targetFault;
  const pendingApprovals = session?.pendingApprovals ?? [];
  const pendingQuestions = session?.pendingQuestions ?? [];
  const approvalActions = useAgentSessionApprovalActions({
    sessionIdentity: identity,
    pendingApprovals,
    canReplyToApprovals: canInteract,
    replyAgentApproval: operations.replyAgentApproval,
  });
  const questionActions = useAgentSessionQuestionActions({
    sessionIdentity: identity,
    pendingQuestions,
    canAnswerQuestions: canInteract,
    answerAgentQuestion: operations.answerAgentQuestion,
  });
  const [isSending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const transcript = resolveAgentChatTranscriptPresentation({
    sessionKey,
    session: session
      ? {
          ...identity,
          title: workspaceSessionTitle(record),
          activityState,
          runtimeStatusMessage: session.runtimeStatusMessage,
          messages: session.messages,
        }
      : null,
    target: { ...identity, sessionScope: { kind: "repository" } },
    state: transcriptState,
    notice: targetFault
      ? {
          kind: "session_failed",
          severity: "error",
          title: "Workspace Session target mismatch",
          description: targetFault.message,
          action: { label: "Retry", onAction: readModel.reloadSessionReadModel },
        }
      : readiness.transcriptNotice,
  });
  const surface = useAgentChatSurfaceModel({
    transcript,
    chatSettings,
    modelCatalog: runtimeData.modelCatalog,
    sessionAuxiliaryError:
      sendError ??
      fault?.message ??
      contextError ??
      runtimeData.contextError ??
      runtimeData.runtimePolicyError ??
      runtimeData.todosError ??
      runtimeData.catalogError ??
      null,
    interactionEnabled: canInteract,
    runtimePresentation: resolveAgentChatRuntimePresentation({
      runtimeDefinitions: runtime.allRuntimeDefinitions,
      runtimeKind: record.runtimeKind,
    }),
    emptyState: null,
    pendingApprovalRequests: pendingApprovals,
    pendingQuestionRequests: pendingQuestions,
    todos: runtimeData.todos,
    sessionAgentColors: picker.agentAccentColorsByProfileId,
    approvals: {
      canReply: canInteract,
      isSubmittingByRequestId: approvalActions.isSubmittingApprovalByRequestId,
      errorByRequestId: approvalActions.approvalReplyErrorByRequestId,
      onReply: approvalActions.onReplyApproval,
    },
    pendingQuestions: {
      canSubmit: canInteract,
      isSubmittingByRequestId: questionActions.isSubmittingQuestionByRequestId,
      onSubmit: questionActions.onSubmitQuestionAnswers,
    },
    composer: {
      displayedSessionKey: sessionKey,
      selectedSession: { ...identity, selectedModel },
      isSessionModelCatalogLoading: runtimeData.isLoadingModelCatalog,
      isSessionWorking: isWorking,
      isWaitingInput: activityState === "waiting_input",
      waitingInputPlaceholder: getAgentSessionWaitingInputPlaceholder({
        pendingApprovals,
        pendingQuestions,
      }),
      busySendBlockedReason: null,
      canStopSession: isWorking || activityState === "waiting_input",
      stopAgentSession: operations.stopAgentSession,
      isReadOnly:
        Boolean(targetFault) || transcriptState.kind === "failed" || session?.status === "error",
      readOnlyReason:
        targetFault?.message ??
        session?.runtimeStatusMessage ??
        (transcriptState.kind === "failed" ? "Retry loading this session before sending." : null),
      draftScope: { key: `${workspace.workspaceId}:${sessionKey}`, persistence: null },
      onSend: async (draft) => {
        if (isSending || !canInteract || !session) return false;
        setSending(true);
        setSendError(null);
        try {
          const parts = await resolveAgentStudioSendDraftParts({
            draft,
            reusablePrompts,
            selectedModelDescriptor: picker.selectedModelEntry,
            supportsAttachments: support.supportsAttachments,
          });
          if (!parts || !mounted.current) return false;
          await operations.sendAgentMessage(identity, parts);
          return true;
        } catch (cause) {
          if (mounted.current) setSendError(errorMessage(cause));
          return false;
        } finally {
          if (mounted.current) setSending(false);
        }
      },
      isSending,
      isStarting: false,
      contextUsage,
      selectedModelSelection: selectedModel,
      selectedModelDescriptor: picker.selectedModelEntry,
      isSelectionCatalogLoading: picker.isLoading,
      supportsProfiles: picker.supportsProfiles,
      supportsAttachments: support.supportsAttachments,
      supportsFileSearch: support.supportsFileSearch,
      supportsSkillReferences: support.supportsSkillReferences,
      supportsSubagentReferences: support.supportsSubagentReferences,
      ...slashCommands,
      ...skills,
      ...subagents,
      searchFiles,
      agentOptions: picker.agentProfileOptions,
      variantOptions: picker.variantOptions,
      onSelectAgent: picker.handleSelectAgentProfile,
      onSelectVariant: picker.handleSelectVariant,
      modelPicker: { ...picker.modelPicker, onOpenChange: () => {} },
    },
  });
  return <AgentChatSurface model={surface} />;
}
