import { TaskDetailsSheet } from "@/components/features/task-details/task-details-sheet";
import { useActiveWorkspace, useTasksState } from "@/state/app-state-provider";

export default function TaskDetailsSheetViewer({
  taskId,
  onOpenChange,
}: {
  taskId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const activeWorkspace = useActiveWorkspace();
  const { tasks } = useTasksState();
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
