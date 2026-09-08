import type { ReactElement } from "react";
import { TaskDetailsSheet } from "@/components/features/task-details/task-details-sheet";
import { useTaskSnapshotContext } from "@/state/app-state-contexts";
import { useActiveWorkspace } from "@/state/app-state-provider";

type TaskDetailsSheetViewerProps = {
  taskId: string;
  onOpenChange: (open: boolean) => void;
};

export default function TaskDetailsSheetViewer({
  taskId,
  onOpenChange,
}: TaskDetailsSheetViewerProps): ReactElement {
  const activeWorkspace = useActiveWorkspace();
  const { tasks } = useTaskSnapshotContext();
  const task = tasks.find((entry) => entry.id === taskId) ?? null;

  return (
    <TaskDetailsSheet
      activeWorkspace={activeWorkspace}
      task={task}
      allTasks={tasks}
      open
      onOpenChange={onOpenChange}
      workflowActionsEnabled={false}
    />
  );
}
