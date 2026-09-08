import { expect, test } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryProvider } from "@/lib/query-provider";
import {
  createTaskCardFixture,
  enableReactActEnvironment,
} from "@/pages/agents/agent-studio-test-utils";
import {
  ActiveWorkspaceContext,
  TasksStateContext,
  WorkspaceStateContext,
} from "@/state/app-state-contexts";
import type { TasksStateContextValue, WorkspaceStateContextValue } from "@/types/state-slices";
import { createMessageCardElement } from "./agent-chat-message-card-test-harness";

enableReactActEnvironment();

test("the task card opens and closes the real detail sheet without leaving chat", async () => {
  const task = createTaskCardFixture({
    id: "created-task",
    title: "Created task detail",
    description: "The full task description.",
  });
  const workspace: WorkspaceStateContextValue = {
    isSwitchingWorkspace: false,
    isLoadingBranches: false,
    isSwitchingBranch: false,
    branchSyncDegraded: false,
    workspaces: [],
    branches: [],
    activeBranch: null,
    activeWorkspace: {
      workspaceId: "workspace-a",
      workspaceName: "Workspace A",
      repoPath: "/repo-a",
      isActive: true,
      hasConfig: true,
      configuredWorktreeBasePath: null,
      defaultWorktreeBasePath: "/tmp/worktrees",
      effectiveWorktreeBasePath: "/tmp/worktrees",
    },
    addWorkspace: async () => {},
    selectWorkspace: async () => {},
    reorderWorkspaces: async () => {},
    refreshBranches: async () => {},
    switchBranch: async () => {},
    loadRepoSettings: async () => {
      throw new Error("Unexpected settings read");
    },
    saveRepoSettings: async () => {},
    loadSettingsSnapshot: async () => {
      throw new Error("Unexpected settings read");
    },
    detectGithubRepository: async () => null,
    saveGlobalGitConfig: async () => {},
    saveSettingsSnapshot: async () => {},
    saveAgentModelFavorites: async () => {
      throw new Error("Unexpected model mutation");
    },
  };
  const tasks: TasksStateContextValue = {
    tasks: [task],
    isLoadingTasks: false,
    isForegroundLoadingTasks: false,
    isRefreshingTasksInBackground: false,
    createTask: async () => {},
    updateTask: async () => {},
    setTaskTargetBranch: async () => {},
    refreshTasks: async () => {},
    syncPullRequests: async () => {},
    linkMergedPullRequest: async () => {},
    cancelLinkMergedPullRequest: () => {},
    unlinkPullRequest: async () => {},
    detectingPullRequestTaskId: null,
    linkingMergedPullRequestTaskId: null,
    unlinkingPullRequestTaskId: null,
    pendingMergedPullRequest: null,
    deleteTask: async () => {},
    closeTask: async () => {},
    resetTaskImplementation: async () => {},
    resetTask: async () => {},
    transitionTask: async () => {},
    humanApproveTask: async () => {},
    humanRequestChangesTask: async () => {},
  };
  const url = window.location.href;
  const view = render(
    <QueryProvider useIsolatedClient>
      <WorkspaceStateContext value={workspace}>
        <ActiveWorkspaceContext
          value={{ activeWorkspace: workspace.activeWorkspace, setActiveWorkspace: () => {} }}
        >
          <TasksStateContext value={tasks}>
            {createMessageCardElement({
              message: {
                id: "created-message",
                role: "tool",
                content: "",
                timestamp: "2026-09-08T10:00:00.000Z",
                meta: {
                  kind: "tool",
                  partId: "p1",
                  callId: "c1",
                  tool: "odt_create_task",
                  toolType: "generic",
                  status: "completed",
                  output: JSON.stringify({
                    task: {
                      id: task.id,
                      title: task.title,
                      description: task.description,
                      status: "open",
                      priority: 2,
                      issueType: "task",
                      labels: [],
                      aiReviewEnabled: true,
                      createdAt: "2026-09-08T10:00:00.000Z",
                      updatedAt: "2026-09-08T10:00:00.000Z",
                      qaVerdict: "not_reviewed",
                      documents: { hasSpec: false, hasPlan: false, hasQaReport: false },
                    },
                  }),
                },
              },
              sessionAgentColors: {},
            })}
          </TasksStateContext>
        </ActiveWorkspaceContext>
      </WorkspaceStateContext>
    </QueryProvider>,
  );
  try {
    fireEvent.click(view.getByRole("button", { name: "Open task details" }));
    await waitFor(() => expect(view.getByRole("button", { name: "Close" })).toBeDefined(), {
      timeout: 1500,
    });
    expect(view.getAllByRole("heading", { name: task.title, level: 2 }).length).toBeGreaterThan(0);
    expect(window.location.href).toBe(url);
    fireEvent.click(view.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(view.queryByRole("button", { name: "Close" })).toBeNull(), {
      timeout: 1500,
    });
    expect(view.getByRole("button", { name: "Open task details" })).toBeDefined();
    expect(window.location.href).toBe(url);
  } finally {
    view.unmount();
  }
});
