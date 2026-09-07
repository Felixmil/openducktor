import { expect, test } from "bun:test";
import type { WorkspaceSession, WorkspaceSessionRefInput } from "@openducktor/contracts";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter } from "react-router";
import { QueryProvider } from "@/lib/query-provider";
import { configureShellBridge, createUnavailableShellBridge } from "@/lib/shell-bridge";
import { createAgentSessionsStore } from "@/state/agent-sessions-store";
import {
  ActiveWorkspaceContext,
  AgentSessionReadModelStateContext,
  AgentSessionsContext,
} from "@/state/app-state-contexts";
import { createShellBridgeFixture } from "@/test-utils/focused-fixture";
import { createAgentSessionFixture } from "@/test-utils/shared-test-fixtures";
import WorkspaceSessionsPage from "./workspace-sessions-page";

const sessionRecord = (id: string): WorkspaceSession => ({
  id,
  runtimeKind: "opencode",
  externalSessionId: `native-${id}`,
  executionTarget: { kind: "local_repo_root", workingDirectory: "/repo" },
  roleSnapshot: null,
  selectedModel: null,
  generatedTitle: null,
  manualTitle: id,
  createdAt: 1000,
  updatedAt: 1000,
  archivedAt: null,
});

test("a durable-list failure is an error rather than an empty Workspace and Retry reloads it", async () => {
  let reads = 0;
  configureShellBridge(
    createShellBridgeFixture({
      client: {
        workspaceSessionListActive: async () => {
          reads += 1;
          if (reads === 1) throw new Error("Workspace database unavailable");
          return [];
        },
        workspaceGetSettingsSnapshot: () => new Promise(() => {}),
      },
    }),
  );
  const view = renderTabs();
  try {
    await view.findByText(
      "Could not load Workspace Sessions: Workspace database unavailable",
      {},
      { timeout: 800 },
    );
    expect(view.queryByText("No active sessions.") === null).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "Retry" }));
    await view.findByText("No active sessions.", {}, { timeout: 800 });
    expect(reads).toBe(2);
  } finally {
    view.unmount();
    configureShellBridge(createUnavailableShellBridge());
  }
});

function renderTabs(runningId?: string) {
  const store = createAgentSessionsStore("/repo");
  if (runningId) {
    store.replaceSession(
      createAgentSessionFixture({
        runtimeKind: "opencode",
        externalSessionId: `native-${runningId}`,
        workingDirectory: "/repo",
        sessionAssociation: { kind: "repository" },
        status: "running",
        pendingApprovals: [],
        pendingQuestions: [],
      }),
    );
  }
  return render(
    <MemoryRouter>
      <QueryProvider useIsolatedClient>
        <ActiveWorkspaceContext
          value={{
            activeWorkspace: { workspaceId: "A", workspaceName: "A", repoPath: "/repo" },
            setActiveWorkspace: () => {},
          }}
        >
          <AgentSessionReadModelStateContext
            value={{
              sessionReadModelLoadState: { kind: "ready", workspaceRepoPath: "/repo" },
              getSessionFault: () => null,
              reloadSessionReadModel: () => {},
            }}
          >
            <AgentSessionsContext value={store}>
              <WorkspaceSessionsPage />
            </AgentSessionsContext>
          </AgentSessionReadModelStateContext>
        </ActiveWorkspaceContext>
      </QueryProvider>
    </MemoryRouter>,
  );
}

test("archive targets its tab, restore preserves selection, and the final archive shows the empty state", async () => {
  const first = sessionRecord("First");
  const second = sessionRecord("Second");
  const requests: (WorkspaceSessionRefInput & { confirmStop: boolean })[] = [];
  configureShellBridge(
    createShellBridgeFixture({
      client: {
        workspaceSessionListActive: async () => [first, second],
        workspaceSessionListArchived: async () => [{ ...second, archivedAt: 2000 }],
        // Tab actions must work before the separate chat settings read completes.
        workspaceGetSettingsSnapshot: () => new Promise(() => {}),
        workspaceSessionArchive: async (input) => {
          requests.push(input);
          return { ...(input.sessionId === first.id ? first : second), archivedAt: 2000 };
        },
        workspaceSessionRestore: async () => second,
      },
    }),
  );
  const view = renderTabs();
  try {
    const firstTab = await view.findByRole("tab", { name: /First/ }, { timeout: 800 });
    expect(firstTab.getAttribute("aria-selected")).toBe("true");
    expect(view.getByRole("tabpanel").id).toBe(firstTab.getAttribute("aria-controls") ?? "");
    const scrollRegion = firstTab.closest(".hide-scrollbar");
    expect(scrollRegion).not.toBeNull();
    expect(scrollRegion?.contains(view.getByRole("button", { name: "New chat" }))).toBe(false);
    expect(scrollRegion?.contains(view.getByRole("button", { name: "Session history" }))).toBe(
      false,
    );
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Archive Second" }));
    });
    await waitFor(() => expect(view.queryByText("Second") === null).toBe(true), { timeout: 800 });
    expect(firstTab.getAttribute("aria-selected")).toBe("true");
    expect(requests).toEqual([{ workspaceId: "A", sessionId: "Second", confirmStop: false }]);
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Session history" }));
    });
    const restore = await view.findByRole("button", { name: "Restore Second" }, { timeout: 800 });
    await act(async () => {
      fireEvent.click(restore);
    });
    await view.findByText("No archived sessions.", {}, { timeout: 800 });
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Close" }));
    });
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull(), { timeout: 800 });
    expect(view.getByRole("tab", { name: /First/ }).getAttribute("aria-selected")).toBe("true");
    expect(view.getByRole("tab", { name: /Second/ }).getAttribute("aria-selected")).toBe("false");
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Archive First" }));
    });
    await waitFor(
      () =>
        expect(view.getByRole("tab", { name: /Second/ }).getAttribute("aria-selected")).toBe(
          "true",
        ),
      { timeout: 800 },
    );
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Archive Second" }));
    });
    await view.findByText("No active sessions.", {}, { timeout: 800 });
    expect(view.queryAllByRole("tab")).toHaveLength(0);
  } finally {
    view.unmount();
    configureShellBridge(createUnavailableShellBridge());
  }
});

test("running archive supports cancel and retains the tab and selection when Stop fails", async () => {
  const requests: (WorkspaceSessionRefInput & { confirmStop: boolean })[] = [];
  configureShellBridge(
    createShellBridgeFixture({
      client: {
        workspaceSessionListActive: async () => [sessionRecord("First"), sessionRecord("Second")],
        workspaceGetSettingsSnapshot: () => new Promise(() => {}),
        workspaceSessionArchive: async (input) => {
          requests.push(input);
          throw new Error("Stop failed: runtime disconnected");
        },
      },
    }),
  );
  const view = renderTabs("Second");
  try {
    fireEvent.click(await view.findByRole("button", { name: "Archive Second" }, { timeout: 800 }));
    expect(view.getByRole("dialog").textContent).toContain("Second is running");
    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    expect(requests).toHaveLength(0);
    fireEvent.click(view.getByRole("button", { name: "Archive Second" }));
    fireEvent.click(view.getByRole("button", { name: "Stop and archive" }));
    await view.findByText("Stop failed: runtime disconnected", {}, { timeout: 800 });
    expect(requests).toEqual([{ workspaceId: "A", sessionId: "Second", confirmStop: true }]);
    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    expect(view.getAllByRole("tab")).toHaveLength(2);
    expect(view.getByRole("tab", { name: /First/ }).getAttribute("aria-selected")).toBe("true");
  } finally {
    view.unmount();
    configureShellBridge(createUnavailableShellBridge());
  }
});

test("an archive in flight disables all tab archive controls", async () => {
  let complete!: (record: WorkspaceSession) => void;
  let calls = 0;
  configureShellBridge(
    createShellBridgeFixture({
      client: {
        workspaceSessionListActive: async () => [sessionRecord("First"), sessionRecord("Second")],
        workspaceGetSettingsSnapshot: () => new Promise(() => {}),
        workspaceSessionArchive: () => {
          calls += 1;
          return new Promise((resolve) => {
            complete = resolve;
          });
        },
      },
    }),
  );
  const view = renderTabs();
  try {
    fireEvent.click(await view.findByRole("button", { name: "Archive Second" }, { timeout: 800 }));
    await waitFor(
      () =>
        expect(view.getByRole("button", { name: "Archive First" }).hasAttribute("disabled")).toBe(
          true,
        ),
      { timeout: 800 },
    );
    fireEvent.click(view.getByRole("button", { name: "Archive First" }));
    expect(calls).toBe(1);
    await act(async () => {
      complete({ ...sessionRecord("Second"), archivedAt: 2000 });
    });
    await waitFor(() => expect(view.queryByRole("tab", { name: /Second/ })).toBeNull(), {
      timeout: 800,
    });
    expect(view.getByRole("button", { name: "Archive First" }).hasAttribute("disabled")).toBe(
      false,
    );
  } finally {
    view.unmount();
    configureShellBridge(createUnavailableShellBridge());
  }
});
