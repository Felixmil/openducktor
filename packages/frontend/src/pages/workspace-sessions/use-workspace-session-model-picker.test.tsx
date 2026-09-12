import { expect, mock, test } from "bun:test";
import { DEFAULT_AGENT_RUNTIMES, OPENCODE_RUNTIME_DESCRIPTOR } from "@openducktor/contracts";
import type { AgentModelCatalog } from "@openducktor/core";
import type { PropsWithChildren } from "react";
import { QueryProvider } from "@/lib/query-provider";
import { configureShellBridge, createUnavailableShellBridge } from "@/lib/shell-bridge";
import {
  RuntimeDefinitionsContext,
  type RuntimeDefinitionsContextValue,
} from "@/state/app-state-contexts";
import { createShellBridgeFixture } from "@/test-utils/focused-fixture";
import { createHookHarness } from "@/test-utils/react-hook-harness";
import { createSettingsSnapshotFixture } from "@/test-utils/shared-test-fixtures";
import { useWorkspaceSessionModelPicker } from "./use-workspace-session-model-picker";

test("live model picker keeps stable props and refreshes when catalog or selection changes", async () => {
  const catalog: AgentModelCatalog = {
    models: [
      {
        id: "openai/gpt-5",
        providerId: "openai",
        modelId: "gpt-5",
        modelName: "GPT 5",
        providerName: "OpenAI",
        variants: ["low", "high"],
      },
    ],
    defaultModelsByProvider: {},
  };
  const definitions: RuntimeDefinitionsContextValue = {
    runtimeDefinitions: [OPENCODE_RUNTIME_DESCRIPTOR],
    availableRuntimeDefinitions: [OPENCODE_RUNTIME_DESCRIPTOR],
    agentRuntimes: DEFAULT_AGENT_RUNTIMES,
    isLoadingRuntimeDefinitions: false,
    runtimeDefinitionsError: null,
    refreshRuntimeDefinitions: async () => [OPENCODE_RUNTIME_DESCRIPTOR],
    isLoadingRuntimeSettings: false,
    runtimeSettingsError: null,
    hasRuntimeSettingsSnapshot: true,
    refreshRuntimeSettings: async () => {},
    loadRepoRuntimeCatalog: async () => catalog,
    loadRepoRuntimeSlashCommands: async () => ({ commands: [] }),
    loadRepoRuntimeSkills: async () => ({ skills: [] }),
    loadRepoRuntimeSubagents: async () => ({ subagents: [] }),
    loadRepoRuntimeFileSearch: async () => [],
  };
  const update = mock(() => {});
  const target = {
    identity: {
      runtimeKind: "opencode" as const,
      externalSessionId: "native-1",
      workingDirectory: "/repo",
    },
    selection: {
      runtimeKind: "opencode" as const,
      providerId: "openai",
      modelId: "gpt-5",
      variant: "low",
    },
    catalog,
    isLoading: false,
    error: null,
    retry: async () => {},
    update,
  };
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryProvider useIsolatedClient>
      <RuntimeDefinitionsContext value={definitions}>{children}</RuntimeDefinitionsContext>
    </QueryProvider>
  );
  configureShellBridge(
    createShellBridgeFixture({
      client: { workspaceGetSettingsSnapshot: async () => createSettingsSnapshotFixture() },
    }),
  );
  const harness = createHookHarness(
    (session: typeof target) => useWorkspaceSessionModelPicker("/repo", session),
    target,
    { wrapper },
  );
  try {
    await harness.mount();
    await harness.waitFor((state) => state.modelPicker.favoriteState.favorites !== null, 2000);
    const initial = harness.getLatest();
    await harness.update(target);
    expect(harness.getLatest().modelPicker).toBe(initial.modelPicker);
    expect(harness.getLatest().variantOptions).toBe(initial.variantOptions);
    expect(harness.getLatest().agentProfileOptions).toBe(initial.agentProfileOptions);

    const changed = { ...target, selection: { ...target.selection, variant: "high" } };
    await harness.update(changed);
    expect(harness.getLatest().selection?.variant).toBe("high");
    expect(harness.getLatest().modelPicker).not.toBe(initial.modelPicker);
    const nextCatalog = {
      ...catalog,
      models: catalog.models.map((model) => ({ ...model, variants: ["medium"] })),
    };
    await harness.update({ ...changed, catalog: nextCatalog });
    expect(harness.getLatest().variantOptions.map((option) => option.value)).toEqual(["medium"]);
    await harness.run((state) =>
      state.modelPicker.onValueChange({
        runtimeKind: "opencode",
        providerId: "openai",
        modelId: "gpt-5",
      }),
    );
    expect(update).toHaveBeenCalledWith(
      target.identity,
      expect.objectContaining({ variant: "medium" }),
    );
  } finally {
    await harness.unmount();
    configureShellBridge(createUnavailableShellBridge());
  }
}, 5000);
