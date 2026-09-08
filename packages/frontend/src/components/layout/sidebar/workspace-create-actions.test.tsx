import { expect, spyOn, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import * as taskCreate from "@/components/features/task-create/task-create-modal";
import { ActiveWorkspaceContext, TasksStateContext } from "@/state/app-state-contexts";
import type { TasksStateContextValue } from "@/types/state-slices";
import WorkspaceCreateActions from "./workspace-create-actions";

function RoutePath() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {location.pathname}
      {location.search}
    </output>
  );
}

test.each([false, true])(
  "sidebar actions open the task dialog and session route, compact=%s",
  (compact) => {
    const tasks: TasksStateContextValue = {
      tasks: [],
      tasksAreCurrent: true,
      isForegroundLoadingTasks: false,
      isRefreshingTasksInBackground: false,
      isLoadingTasks: false,
      detectingPullRequestTaskId: null,
      linkingMergedPullRequestTaskId: null,
      unlinkingPullRequestTaskId: null,
      pendingMergedPullRequest: null,
      refreshTasks: async () => {},
      syncPullRequests: async () => {},
      linkMergedPullRequest: async () => {},
      cancelLinkMergedPullRequest: () => {},
      unlinkPullRequest: async () => {},
      createTask: async () => {},
      updateTask: async () => {},
      setTaskTargetBranch: async () => {},
      deleteTask: async () => {},
      closeTask: async () => {},
      resetTaskImplementation: async () => {},
      resetTask: async () => {},
      transitionTask: async () => {},
      humanApproveTask: async () => {},
      humanRequestChangesTask: async () => {},
    };
    const modal = spyOn(taskCreate, "TaskCreateModal").mockImplementation((props) => {
      expect(props.open).toBe(true);
      expect(props.tasks).toBe(tasks.tasks);
      return <div role="dialog" aria-label="Task creation" />;
    });
    const view = render(
      <MemoryRouter>
        <ActiveWorkspaceContext
          value={{
            activeWorkspace: { workspaceId: "A", workspaceName: "A", repoPath: "/repo" },
            setActiveWorkspace: () => {},
          }}
        >
          <TasksStateContext value={tasks}>
            <WorkspaceCreateActions compact={compact} />
            <RoutePath />
          </TasksStateContext>
        </ActiveWorkspaceContext>
      </MemoryRouter>,
    );
    try {
      const newTask = view.getByRole("button", { name: "New task" });
      if (!compact) expect(newTask.className).toContain("text-sm");
      fireEvent.click(newTask);
      expect(view.queryByRole("dialog", { name: "Task creation" }) !== null).toBe(true);
      fireEvent.click(view.getByRole("button", { name: "New chat" }));
      expect(view.getByLabelText("Current route").textContent).toBe(
        "/workspace-sessions?create=session",
      );
    } finally {
      view.unmount();
      modal.mockRestore();
    }
  },
);
