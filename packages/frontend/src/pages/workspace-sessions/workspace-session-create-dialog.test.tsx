import { expect, test } from "bun:test";
import {
  DEFAULT_AGENT_RUNTIMES,
  OPENCODE_RUNTIME_DESCRIPTOR,
  type WorkspaceSessionCreateInput,
} from "@openducktor/contracts";
import type { AgentModelCatalog } from "@openducktor/core";
import { HostInvokeError } from "@openducktor/host-client";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { act, type ComponentProps } from "react";
import { QueryProvider } from "@/lib/query-provider";
import { configureShellBridge, createUnavailableShellBridge } from "@/lib/shell-bridge";
import {
  ChecksStateContext,
  RuntimeDefinitionsContext,
  WorkspaceStateContext,
} from "@/state/app-state-contexts";
import { createShellBridgeFixture } from "@/test-utils/focused-fixture";
import { createSettingsSnapshotFixture } from "@/test-utils/shared-test-fixtures";
import { WorkspaceSessionCreateDialog } from "./workspace-session-create-dialog";

function renderCreation(
  create: (input: WorkspaceSessionCreateInput) => Promise<never>,
  onClose = () => {},
  onCreated: () => void = () => {
    throw new Error("Unexpected successful creation");
  },
) {
  const snapshot = createSettingsSnapshotFixture();
  const catalog: AgentModelCatalog = {
    runtime: OPENCODE_RUNTIME_DESCRIPTOR,
    models: [
      {
        id: "provider/model",
        providerId: "provider",
        providerName: "Provider",
        modelId: "model",
        modelName: "Test model",
        variants: ["low", "high"],
      },
    ],
    defaultModelsByProvider: {},
    profiles: [{ name: "runtime-profile", mode: "primary", hidden: false }],
  };
  const workspaceState: ComponentProps<typeof WorkspaceStateContext>["value"] = {
    isSwitchingWorkspace: false,
    isLoadingBranches: false,
    isSwitchingBranch: false,
    branchSyncDegraded: false,
    workspaces: [],
    activeWorkspace: null,
    branches: [],
    activeBranch: null,
    addWorkspace: async () => {},
    selectWorkspace: async () => {},
    reorderWorkspaces: async () => {},
    refreshBranches: async () => {},
    switchBranch: async () => {},
    loadRepoSettings: async () => {
      throw new Error("Unexpected settings read");
    },
    saveRepoSettings: async () => {
      throw new Error("Unexpected settings save");
    },
    loadSettingsSnapshot: async () => snapshot,
    detectGithubRepository: async () => null,
    saveGlobalGitConfig: async () => {},
    saveSettingsSnapshot: async () => {},
    saveAgentModelFavorites: async () => snapshot,
  };
  const definitions: ComponentProps<typeof RuntimeDefinitionsContext>["value"] = {
    runtimeDefinitions: [OPENCODE_RUNTIME_DESCRIPTOR],
    availableRuntimeDefinitions: [OPENCODE_RUNTIME_DESCRIPTOR],
    agentRuntimes: DEFAULT_AGENT_RUNTIMES,
    isLoadingRuntimeDefinitions: false,
    runtimeDefinitionsError: null,
    isLoadingRuntimeSettings: false,
    runtimeSettingsError: null,
    hasRuntimeSettingsSnapshot: true,
    refreshRuntimeDefinitions: async () => [OPENCODE_RUNTIME_DESCRIPTOR],
    refreshRuntimeSettings: async () => {},
    loadRepoRuntimeCatalog: async () => catalog,
    loadRepoRuntimeSlashCommands: async () => ({ commands: [] }),
    loadRepoRuntimeSkills: async () => ({ skills: [] }),
    loadRepoRuntimeSubagents: async () => ({ subagents: [] }),
    loadRepoRuntimeFileSearch: async () => [],
  };
  configureShellBridge(
    createShellBridgeFixture({
      client: {
        workspaceGetSettingsSnapshot: async () => snapshot,
        customAgentRoleList: async () => [
          { id: "alpha", name: "Alpha", systemPrompt: "Alpha prompt" },
          { id: "zeta", name: "Zeta", systemPrompt: "Zeta prompt" },
        ],
        workspaceSessionCreate: create,
      },
    }),
  );
  return render(
    <QueryProvider useIsolatedClient>
      <WorkspaceStateContext value={workspaceState}>
        <ChecksStateContext
          value={{
            runtimeCheck: null,
            taskStoreCheck: null,
            runtimeCheckFailureKind: null,
            taskStoreCheckFailureKind: null,
            isLoadingChecks: false,
            refreshChecks: async () => {},
          }}
        >
          <RuntimeDefinitionsContext value={definitions}>
            <WorkspaceSessionCreateDialog
              workspace={{ workspaceId: "A", workspaceName: "A", repoPath: "/repo" }}
              onClose={onClose}
              onCreated={onCreated}
            />
          </RuntimeDefinitionsContext>
        </ChecksStateContext>
      </WorkspaceStateContext>
    </QueryProvider>,
  );
}

async function selectModel(view: ReturnType<typeof renderCreation>) {
  fireEvent.click(view.getByRole("button", { name: "Select model, Select a model" }));
  const choice = await view.findByRole(
    "button",
    { name: "Select Test model model" },
    { timeout: 800 },
  );
  fireEvent.click(choice);
  await waitFor(
    () =>
      expect(view.getByRole("button", { name: "Create chat" }).hasAttribute("disabled")).toBe(
        false,
      ),
    { timeout: 800 },
  );
}

test("an ordinary creation failure retains inputs, re-enables the form and does not report success", async () => {
  let rejectCreation!: (cause: Error) => void;
  let created = 0;
  let closed = 0;
  const view = renderCreation(
    () =>
      new Promise<never>((_resolve, reject) => {
        rejectCreation = reject;
      }),
    () => {
      closed += 1;
    },
    () => {
      created += 1;
    },
  );
  try {
    await selectModel(view);
    const name = view.getByLabelText("Name optional");
    fireEvent.change(name, { target: { value: "Retained session" } });
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Create chat" }));
    });
    await act(async () => {
      rejectCreation(new Error("Runtime startup failed: executable missing"));
    });
    await view.findByRole("alert", {}, { timeout: 800 });
    expect(view.getByRole("alert").textContent).toBe("Runtime startup failed: executable missing");
    expect(view.getByDisplayValue("Retained session") !== null).toBe(true);
    expect(name.closest("fieldset")?.disabled).toBe(false);
    expect(view.getByRole("button", { name: "Create chat" }).hasAttribute("disabled")).toBe(false);
    expect(
      view
        .getByRole("button", { name: "Select model, OpenCode, Test model" })
        .getAttribute("aria-disabled"),
    ).toBe("false");
    expect(created).toBe(0);
    expect(closed).toBe(0);
  } finally {
    view.unmount();
    configureShellBridge(createUnavailableShellBridge());
  }
});

test("creation keeps Role, Runtime Profile, Effort and location separate and blocks duplicate pending input", async () => {
  const requests: WorkspaceSessionCreateInput[] = [];
  let closed = 0;
  const view = renderCreation(
    async (input) => {
      requests.push(input);
      return new Promise<never>(() => {});
    },
    () => {
      closed += 1;
    },
  );
  try {
    await selectModel(view);
    fireEvent.click(view.getByRole("button", { name: "Custom role optional" }));
    expect(view.getAllByRole("option").map((entry) => entry.textContent?.trim())).toEqual([
      "No role",
      "Alpha",
      "Zeta",
    ]);
    fireEvent.click(view.getByRole("option", { name: "Alpha" }));
    fireEvent.click(view.getByRole("button", { name: "Runtime profile" }));
    fireEvent.click(view.getByRole("option", { name: "runtime-profile" }));
    fireEvent.click(view.getByRole("button", { name: "Effort" }));
    fireEvent.click(view.getByRole("option", { name: "high" }));
    fireEvent.change(view.getByLabelText("Name optional"), { target: { value: "My session" } });
    fireEvent.click(view.getByRole("radio", { name: /New worktree/ }));
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Create chat" }));
    });
    await waitFor(() => expect(requests.length).toBe(1), { timeout: 800 });
    expect(requests[0]).toEqual({
      workspaceId: "A",
      runtimeKind: "opencode",
      selectedModel: {
        runtimeKind: "opencode",
        providerId: "provider",
        modelId: "model",
        variant: "high",
        profileId: "runtime-profile",
      },
      customAgentRoleId: "alpha",
      location: "local_worktree",
      manualTitle: "My session",
      confirmUncommittedChanges: false,
    });
    const name = view.getByLabelText("Name optional");
    const fieldset = name.closest("fieldset");
    expect(fieldset?.disabled).toBe(true);
    expect(
      view
        .getByRole("button", { name: "Select model, OpenCode, Test model" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    fireEvent.submit(name.closest("form")!);
    fireEvent.click(view.getByRole("button", { name: "Close" }));
    expect(requests.length).toBe(1);
    expect(closed).toBe(0);
  } finally {
    view.unmount();
    configureShellBridge(createUnavailableShellBridge());
  }
});

test("dirty checkout confirmation requires a second explicit create and Cancel sends no confirmation", async () => {
  const requests: WorkspaceSessionCreateInput[] = [];
  let closed = 0;
  const view = renderCreation(
    async (input) => {
      requests.push(input);
      throw new HostInvokeError("Confirm dirty checkout", {
        kind: "workspace_session_confirmation",
        field: "confirmUncommittedChanges",
      });
    },
    () => {
      closed += 1;
    },
  );
  try {
    await selectModel(view);
    fireEvent.click(view.getByRole("radio", { name: /New worktree/ }));
    fireEvent.click(view.getByRole("button", { name: "Create chat" }));
    await view.findByText(
      "This checkout has uncommitted changes. The new worktree will not include them.",
      {},
      { timeout: 800 },
    );
    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    expect(closed).toBe(1);
    expect(requests.map((input) => input.confirmUncommittedChanges)).toEqual([false]);
    fireEvent.click(view.getByRole("button", { name: "Create without uncommitted changes" }));
    await waitFor(() => expect(requests.length).toBe(2), { timeout: 800 });
    expect(requests[1]?.confirmUncommittedChanges).toBe(true);
    expect(requests[1]?.customAgentRoleId).toBeNull();
  } finally {
    view.unmount();
    configureShellBridge(createUnavailableShellBridge());
  }
});
