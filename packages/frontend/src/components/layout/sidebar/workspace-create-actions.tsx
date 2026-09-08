import { MessageCirclePlus, ListPlus } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useNavigate } from "react-router";
import { TaskCreateModal } from "@/components/features/task-create/task-create-modal";
import { Button } from "@/components/ui/button";
import { useActiveWorkspace, useTasksState } from "@/state/app-state-provider";

type WorkspaceCreateActionsProps = { compact?: boolean };

export default function WorkspaceCreateActions({
  compact = false,
}: WorkspaceCreateActionsProps): ReactElement {
  const [taskOpen, setTaskOpen] = useState(false);
  const { tasks } = useTasksState();
  const workspace = useActiveWorkspace();
  const navigate = useNavigate();
  const buttonSize = compact ? "icon" : "default";
  const buttonClassName = compact
    ? "size-9"
    : "w-full justify-start gap-2 rounded-lg px-3 text-sm font-medium text-sidebar-foreground";
  return (
    <>
      <div className="flex flex-col gap-1 border-t border-sidebar-border pt-3">
        <Button
          variant="ghost"
          size={buttonSize}
          className={buttonClassName}
          aria-label="New task"
          title="New task"
          disabled={!workspace}
          onClick={() => setTaskOpen(true)}
        >
          <ListPlus aria-hidden="true" />
          {!compact && "New task"}
        </Button>
        <Button
          variant="ghost"
          size={buttonSize}
          className={buttonClassName}
          aria-label="New chat"
          title="New chat"
          disabled={!workspace}
          onClick={() => navigate("/workspace-sessions?create=session")}
        >
          <MessageCirclePlus />
          {!compact && "New chat"}
        </Button>
      </div>
      {taskOpen && workspace && (
        <TaskCreateModal
          key={workspace.workspaceId}
          open
          onOpenChange={setTaskOpen}
          tasks={tasks}
        />
      )}
    </>
  );
}
