import type { AgentModelCatalog, AgentModelSelection } from "@openducktor/core";
import { useCallback, useMemo, useState } from "react";
import {
  toModelPickerCatalogResource,
  unavailableModelPickerCatalogResource,
  type ModelPickerRuntime,
  type ModelPickerValue,
} from "@/components/features/agents/model-picker";
import { resolveModelSelectionOptions } from "@/features/agent-chat-composer/model-selection/model-selection-options";
import { useModelSelectionActions } from "@/features/agent-chat-composer/model-selection/use-model-selection-actions";
import { useRuntimeAvailabilityContext } from "@/state/app-state-contexts";
import { useAgentModelFavorites } from "@/state/mutations/use-agent-model-favorites";
import { host } from "@/state/operations/host";
import { useRuntimeModelCatalogs } from "@/state/queries/use-runtime-model-catalogs";
import type { AgentSessionIdentity } from "@/types/agent-orchestrator";

type SessionModelTarget = {
  identity: AgentSessionIdentity | null;
  runtimeKind?: AgentSessionIdentity["runtimeKind"];
  updateDraft?: (selection: AgentModelSelection | null) => void;
  selection: AgentModelSelection | null;
  catalog: AgentModelCatalog | null;
  isLoading: boolean;
  error: string | null;
  retry: () => Promise<void>;
  update: (
    identity: AgentSessionIdentity,
    selection: AgentModelSelection | null,
  ) => Promise<void> | void;
};

const rejectMissingSessionUpdate = (): never => {
  throw new Error("No existing session is selected.");
};
const onModelPickerOpenChange = (): void => {};

/** Uses the existing model picker and selection policies for both creation and chat. */
export function useWorkspaceSessionModelPicker(repoPath: string, session?: SessionModelTarget) {
  const { availableRuntimeDefinitions, allRuntimeDefinitions, loadRepoRuntimeCatalog } =
    useRuntimeAvailabilityContext();
  const [draftSelection, setDraftSelection] = useState<AgentModelSelection | null>(null);
  const definitions = session ? allRuntimeDefinitions : availableRuntimeDefinitions;
  const runtimeKinds = useMemo(() => definitions.map((entry) => entry.kind), [definitions]);
  const hasSession = session !== undefined;
  const enabledRuntimeKinds = useMemo(
    () => (hasSession ? [] : runtimeKinds),
    [runtimeKinds, hasSession],
  );
  const { resources } = useRuntimeModelCatalogs({
    repoPath,
    runtimeKinds,
    enabledRuntimeKinds,
    loadCatalog: loadRepoRuntimeCatalog,
  });
  const favoriteState = useAgentModelFavorites({
    saveAgentModelFavorites: host.workspaceUpdateAgentModelFavorites,
  });
  const selection = session ? session.selection : draftSelection;
  const catalog = session
    ? session.catalog
    : (resources.find((resource) => resource.runtimeKind === selection?.runtimeKind)?.catalog ??
      null);
  const options = useMemo(
    () =>
      resolveModelSelectionOptions({
        liveSession: hasSession,
        selectionCatalog: catalog,
        selectedModelSelection: selection,
      }),
    [hasSession, catalog, selection],
  );
  const actions = useModelSelectionActions({
    loadedSessionIdentity: session?.identity ?? null,
    updateAgentSessionModel: session?.update ?? rejectMissingSessionUpdate,
    applyDraftSelection: session?.updateDraft ?? setDraftSelection,
    selectedModelSelection: selection,
    selectionCatalog: catalog,
    selectedRuntimeKind:
      session?.identity?.runtimeKind ?? session?.runtimeKind ?? selection?.runtimeKind ?? null,
  });
  const creationResources = session ? null : resources;
  const runtimes = useMemo<ModelPickerRuntime[]>(
    () =>
      definitions.map((descriptor) => {
        if (session)
          return {
            descriptor,
            resource:
              descriptor.kind === (session.identity?.runtimeKind ?? session.runtimeKind)
                ? toModelPickerCatalogResource({
                    catalog: session.catalog,
                    isFetching: session.isLoading,
                    error: session.error,
                    isAvailable: true,
                    unavailableReason: "Session model catalog is unavailable.",
                    retry: session.retry,
                  })
                : unavailableModelPickerCatalogResource(
                    "Start a new session to use another runtime.",
                  ),
          };
        const resource = creationResources?.find((entry) => entry.runtimeKind === descriptor.kind);
        return {
          descriptor,
          resource: resource
            ? toModelPickerCatalogResource({
                catalog: resource.catalog,
                isFetching: resource.isFetching,
                error: resource.error,
                isAvailable: resource.isEnabled,
                unavailableReason: "Runtime catalog is unavailable.",
                retry: resource.retry,
              })
            : unavailableModelPickerCatalogResource("Runtime catalog is unavailable."),
        };
      }),
    [definitions, session, creationResources],
  );
  const { handleSelectModelPair } = actions;
  const onValueChange = useCallback(
    (value: ModelPickerValue) => {
      const runtime = runtimes.find((entry) => entry.descriptor.kind === value.runtimeKind);
      if (runtime?.resource.status === "ready")
        handleSelectModelPair(value, runtime.resource.catalog);
    },
    [runtimes, handleSelectModelPair],
  );
  const runtimeKind =
    session?.identity?.runtimeKind ?? session?.runtimeKind ?? selection?.runtimeKind;
  const supportsProfiles =
    definitions.find((entry) => entry.kind === runtimeKind)?.capabilities.optionalSurfaces
      .supportsProfiles ?? false;
  const sessionRuntimeKind = session?.identity?.runtimeKind ?? session?.runtimeKind;
  const modelPicker = useMemo(
    () => ({
      runtimes,
      value: selection?.runtimeKind
        ? {
            runtimeKind: selection.runtimeKind,
            providerId: selection.providerId,
            modelId: selection.modelId,
          }
        : null,
      selectionPolicy: sessionRuntimeKind
        ? {
            kind: "runtime_locked" as const,
            runtimeKind: sessionRuntimeKind,
            reason: "An existing session cannot change runtime.",
          }
        : { kind: "editable" as const },
      favoriteState,
      onValueChange,
      onOpenChange: onModelPickerOpenChange,
    }),
    [runtimes, selection, sessionRuntimeKind, favoriteState, onValueChange],
  );
  return {
    selection,
    catalog,
    supportsProfiles,
    ...options,
    ...actions,
    isLoading: session ? session.isLoading : resources.some((entry) => entry.isFetching),
    modelPicker,
  };
}
