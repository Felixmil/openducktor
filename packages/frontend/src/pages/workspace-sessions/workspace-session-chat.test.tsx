import { expect, test } from "bun:test";
import {
  DEFAULT_AGENT_RUNTIMES,
  DEFAULT_CHAT_SETTINGS,
  OPENCODE_RUNTIME_DESCRIPTOR,
  type WorkspaceSession,
} from "@openducktor/contracts";
import { act, useState } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryProvider } from "@/lib/query-provider";
import { configureShellBridge, createUnavailableShellBridge } from "@/lib/shell-bridge";
import { createAgentSessionsStore } from "@/state/agent-sessions-store";
import {
  AgentOperationsContext,
  AgentSessionHistoryLoadContext,
  AgentSessionReadModelStateContext,
  AgentSessionsContext,
  RepoRuntimeHealthContext,
  RuntimeDefinitionsContext,
  type RuntimeDefinitionsContextValue,
} from "@/state/app-state-contexts";
import { createShellBridgeFixture } from "@/test-utils/focused-fixture";
import {
  createAgentSessionFixture,
  createRepoRuntimeHealthFixture,
  createSettingsSnapshotFixture,
} from "@/test-utils/shared-test-fixtures";
import type {
  AgentOperationsContextValue,
  AgentSessionReadModelStateContextValue,
} from "@/types/state-slices";
import { WorkspaceSessionChat } from "./workspace-session-chat";

test("a loaded chat stays disabled during target Retry until observation is ready", async () => {
  const workspace = { workspaceId: "A", workspaceName: "Test", repoPath: "/repo" };
  const entry: WorkspaceSession = {
    id: "session-1",
    runtimeKind: "opencode",
    externalSessionId: "native-1",
    executionTarget: { kind: "local_repo_root", workingDirectory: "/repo" },
    roleSnapshot: null,
    selectedModel: null,
    generatedTitle: null,
    manualTitle: null,
    createdAt: 1000,
    updatedAt: 1000,
    archivedAt: null,
  };
  const session = createAgentSessionFixture({
    runtimeKind: "opencode",
    externalSessionId: "native-1",
    workingDirectory: "/repo",
    sessionAssociation: { kind: "repository" },
    historyLoadState: "loaded",
    status: "idle",
    messages: [],
    pendingApprovals: [],
    pendingQuestions: [],
  });
  const store = createAgentSessionsStore("/repo");
  store.replaceSession(session);
  const operations: AgentOperationsContextValue = {
    readSessionTodos: async () => [],
    readSessionHistory: async () => [],
    loadAgentSessionHistory: async () => session,
    loadAgentSessionContext: async () => {},
    startAgentSession: async () => {
      throw new Error("Unexpected session startup");
    },
    sendAgentMessage: async () => {
      throw new Error("Unexpected message send");
    },
    stopAgentSession: async () => {},
    updateAgentSessionModel: () => {},
    replyAgentApproval: async () => {},
    answerAgentQuestion: async () => {},
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
    loadRepoRuntimeCatalog: async () => ({ models: [], defaultModelsByProvider: {} }),
    loadRepoRuntimeSlashCommands: async () => ({ commands: [] }),
    loadRepoRuntimeSkills: async () => ({ skills: [] }),
    loadRepoRuntimeSubagents: async () => ({ subagents: [] }),
    loadRepoRuntimeFileSearch: async () => [],
  };
  const health = { opencode: createRepoRuntimeHealthFixture() };
  let completeObservation!: () => void;
  function Harness() {
    const [phase, setPhase] = useState<"fault" | "loading" | "ready">("fault");
    completeObservation = () => setPhase("ready");
    const readModel: AgentSessionReadModelStateContextValue = {
      sessionReadModelLoadState: {
        kind: phase === "loading" ? "loading" : "ready",
        workspaceRepoPath: "/repo",
      },
      getSessionFault: () =>
        phase === "fault"
          ? { source: "workspace-target", message: "Runtime directory mismatch" }
          : null,
      reloadSessionReadModel: () => setPhase("loading"),
    };
    return (
      <QueryProvider useIsolatedClient>
        <RuntimeDefinitionsContext value={definitions}>
          <RepoRuntimeHealthContext
            value={{
              runtimeHealthByRuntime: health,
              isLoadingRepoRuntimeHealth: false,
              refreshRepoRuntimeHealth: async () => health,
            }}
          >
            <AgentOperationsContext value={operations}>
              <AgentSessionHistoryLoadContext
                value={{ loadSelectedSessionBaselineHistory: async () => session }}
              >
                <AgentSessionReadModelStateContext value={readModel}>
                  <AgentSessionsContext value={store}>
                    <WorkspaceSessionChat
                      workspace={workspace}
                      record={entry}
                      chatSettings={DEFAULT_CHAT_SETTINGS}
                      reusablePrompts={[]}
                    />
                  </AgentSessionsContext>
                </AgentSessionReadModelStateContext>
              </AgentSessionHistoryLoadContext>
            </AgentOperationsContext>
          </RepoRuntimeHealthContext>
        </RuntimeDefinitionsContext>
      </QueryProvider>
    );
  }
  configureShellBridge(
    createShellBridgeFixture({
      client: { workspaceGetSettingsSnapshot: async () => createSettingsSnapshotFixture() },
    }),
  );
  const view = render(<Harness />);
  try {
    const composer = view.getByLabelText("Message composer");
    expect(composer.getAttribute("contenteditable")).toBe("false");
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Retry" }));
    });
    expect(composer.getAttribute("contenteditable")).toBe("false");
    expect(view.queryByText("Workspace Session target mismatch")).toBeNull();
    await act(async () => {
      completeObservation();
    });
    await waitFor(() => expect(composer.getAttribute("contenteditable")).toBe("true"), {
      timeout: 800,
    });
  } finally {
    view.unmount();
    configureShellBridge(createUnavailableShellBridge());
  }
});
