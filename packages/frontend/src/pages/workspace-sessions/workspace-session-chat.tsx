import type { ChatSettings, ReusablePrompt, WorkspaceSession } from "@openducktor/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useCallback, useMemo } from "react";
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
import {
  repoRuntimeCatalogQueryOptions,
  runtimeCatalogQueryKeys,
} from "@/state/queries/runtime-catalog";
import { createWorkspaceSessionChatDraftPersistence } from "./workspace-session-chat-draft";
import type { ActiveWorkspace } from "@/types/state-slices";
import { useWorkspaceSessionModelPicker } from "./use-workspace-session-model-picker";
import { useWorkspaceSessionChatActions } from "./use-workspace-session-chat-actions";

type WorkspaceSessionChatProps = {
  workspace: ActiveWorkspace;
  record: WorkspaceSession;
  chatSettings: ChatSettings;
  reusablePrompts: ReusablePrompt[];
};

export function WorkspaceSessionChat({
  workspace,
  record,
  chatSettings,
  reusablePrompts,
}: WorkspaceSessionChatProps): ReactElement {
  const identity = useMemo(() => workspaceSessionIdentity(record), [record]);
  const sessionKey = identity ? agentSessionIdentityKey(identity) : null;
  const session = useAgentSession(identity);
  const actions = useWorkspaceSessionChatActions(workspace, record);
  const { isSending, isStarting, isSavingModel, updateDraftModel } = actions;
  const draftPersistence = useMemo(
    () => createWorkspaceSessionChatDraftPersistence(workspace.workspaceId, record.id),
    [workspace.workspaceId, record.id],
  );
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
    selectedSession:
      identity && !isStarting
        ? { identity, selectedModel, sessionAssociation: { kind: "repository" } }
        : null,
    runtimeDefinitions: runtime.allRuntimeDefinitions,
    repoReadinessState: runtimeReadiness.state,
    loadRuntimeCatalog: runtime.loadRepoRuntimeCatalog,
    readSessionTodos: operations.readSessionTodos,
  });
  const catalogQuery = useQuery({
    ...repoRuntimeCatalogQueryOptions(
      { repoPath: workspace.repoPath, runtimeKind: record.runtimeKind },
      runtime.loadRepoRuntimeCatalog,
    ),
    enabled: runtimeReadiness.state === "ready",
  });
  const modelCatalog = catalogQuery.data ?? null;
  const catalogError = catalogQuery.error ? errorMessage(catalogQuery.error) : null;
  const isLoadingModelCatalog = catalogQuery.isFetching;
  useSelectedSessionHistoryLoad({
    session: isStarting ? null : session,
    repoReadinessState: runtimeReadiness.state,
  });
  const contextError = useSelectedSessionContextLoad({
    session: isStarting ? null : session,
    repoReadinessState: runtimeReadiness.state,
  });
  const retryModelCatalog = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: runtimeCatalogQueryKeys.repo(workspace.repoPath, record.runtimeKind),
      }),
    [queryClient, record.runtimeKind, workspace.repoPath],
  );
  const modelTarget = useMemo(
    () => ({
      identity,
      runtimeKind: record.runtimeKind,
      updateDraft: updateDraftModel,
      selection: selectedModel,
      catalog: modelCatalog,
      isLoading: isLoadingModelCatalog,
      error: catalogError,
      retry: retryModelCatalog,
      update: operations.updateAgentSessionModel,
    }),
    [
      identity,
      record.runtimeKind,
      updateDraftModel,
      selectedModel,
      modelCatalog,
      isLoadingModelCatalog,
      catalogError,
      retryModelCatalog,
      operations.updateAgentSessionModel,
    ],
  );
  const picker = useWorkspaceSessionModelPicker(workspace.repoPath, modelTarget);
  const runtimePresentation = useMemo(
    () =>
      resolveAgentChatRuntimePresentation({
        runtimeDefinitions: runtime.allRuntimeDefinitions,
        runtimeKind: record.runtimeKind,
      }),
    [runtime.allRuntimeDefinitions, record.runtimeKind],
  );
  const promptInputRuntime = useMemo(() => {
    const resolved = resolveChatComposerPromptInputRuntime({
      workspaceRepoPath: workspace.repoPath,
      repoReadinessState: runtimeReadiness.state,
      source: identity
        ? { kind: "session", session: identity }
        : { kind: "repo", runtimeKind: record.runtimeKind },
    });
    if (resolved.state !== "available") return resolved;
    return {
      ...resolved,
      runtimeRef: {
        ...resolved.runtimeRef,
        workingDirectory: record.executionTarget.workingDirectory,
      },
    };
  }, [
    identity,
    runtimeReadiness.state,
    workspace.repoPath,
    record.runtimeKind,
    record.executionTarget.workingDirectory,
  ]);
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
    sessionModelCatalog: modelCatalog,
    selectedModelEntry: picker.selectedModelEntry,
  });
  const observationReady = readModel.sessionReadModelLoadState.kind === "ready";
  const fault = readModel.getSessionFault(identity);
  const targetFault = fault?.source === "workspace-target" ? fault : null;
  const activityState =
    session && observationReady ? getAgentSessionActivityStateFromSession(session) : null;
  const isWorking = isAgentSessionActivityWorking(activityState);
  let transcriptState;
  if (!identity) {
    transcriptState = { kind: "empty" as const, reason: "sessionless" as const };
  } else if (session) {
    transcriptState = deriveLoadedAgentSessionTranscriptState({
      session,
      repoReadinessState: runtimeReadiness.state,
    });
  } else {
    transcriptState = derivePendingSelectedSessionTranscriptState({
      readModelLoadState: readModel.sessionReadModelLoadState,
      repoReadinessState: runtimeReadiness.state,
    });
  }
  const readiness = deriveAgentChatReadiness({
    transcriptState,
    runtimeReadiness,
    runtimeBlockedAction: {
      label: "Recheck",
      onAction: () => void runtimeReadiness.refreshChecks(),
    },
    failedTranscriptAction: {
      label: "Retry",
      onAction: () => {
        if (identity) void operations.loadAgentSessionHistory(identity);
      },
    },
  });
  const canInteract =
    readiness.interactionEnabled && observationReady && !targetFault && !isSavingModel;
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
  const transcript = resolveAgentChatTranscriptPresentation({
    repoPath: workspace.repoPath,
    sessionKey,
    session:
      session && identity
        ? {
            ...identity,
            title: workspaceSessionTitle(record),
            activityState,
            runtimeStatusMessage: session.runtimeStatusMessage,
            messages: session.messages,
          }
        : null,
    target: identity ? { ...identity, sessionScope: { kind: "repository" } } : null,
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
    modelCatalog,
    sessionAuxiliaryError:
      actions.error ??
      fault?.message ??
      contextError ??
      runtimeData.contextError ??
      runtimeData.runtimePolicyError ??
      runtimeData.todosError ??
      catalogError ??
      null,
    interactionEnabled: canInteract,
    runtimePresentation,
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
      selectedSession: identity ? { ...identity, selectedModel } : null,
      isSessionModelCatalogLoading: isLoadingModelCatalog,
      isSessionWorking: isWorking,
      isWaitingInput: activityState === "waiting_input",
      waitingInputPlaceholder: getAgentSessionWaitingInputPlaceholder({
        pendingApprovals,
        pendingQuestions,
      }),
      busySendBlockedReason: null,
      canStopSession: isWorking || activityState === "waiting_input",
      stopAgentSession: operations.stopAgentSession,
      isReadOnly: Boolean(targetFault) || transcriptState.kind === "failed",
      readOnlyReason:
        targetFault?.message ??
        session?.runtimeStatusMessage ??
        (transcriptState.kind === "failed" ? "Retry loading this session before sending." : null),
      draftScope: { key: draftPersistence.targetKey, persistence: draftPersistence },
      onSend: (draft) =>
        actions.sendDraft(draft, {
          canSend: canInteract,
          reusablePrompts,
          selectedModelDescriptor: picker.selectedModelEntry,
          supportsAttachments: support.supportsAttachments,
        }),
      isSending,
      isStarting,
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
      modelPicker: picker.modelPicker,
    },
  });
  return <AgentChatSurface model={surface} />;
}
