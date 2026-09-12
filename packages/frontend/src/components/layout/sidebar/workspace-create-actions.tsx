import { MessageCirclePlus, ListPlus } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useNavigate } from "react-router";
import { TaskCreateModal } from "@/components/features/task-create/task-create-modal";
import { Button } from "@/components/ui/button";
import { WorkspaceSessionCreateDialog } from "@/pages/workspace-sessions/workspace-session-create-dialog";
import { useActiveWorkspace, useTasksState } from "@/state/app-state-provider";

type WorkspaceCreateActionsProps = { compact?: boolean };

function WorkspaceTaskCreateModal({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { tasks } = useTasksState();
  return <TaskCreateModal open onOpenChange={onOpenChange} tasks={tasks} />;
}

export default function WorkspaceCreateActions({
  compact = false,
}: WorkspaceCreateActionsProps): ReactElement {
  const [taskOpen, setTaskOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
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
          onClick={() => setChatOpen(true)}
        >
          <MessageCirclePlus />
          {!compact && "New chat"}
        </Button>
      </div>
      {taskOpen && workspace && (
        <WorkspaceTaskCreateModal key={workspace.workspaceId} onOpenChange={setTaskOpen} />
      )}
      {chatOpen && workspace && (
        <WorkspaceSessionCreateDialog
          key={`chat-${workspace.workspaceId}`}
          workspace={workspace}
          onClose={() => setChatOpen(false)}
          onCreated={(session) => {
            setChatOpen(false);
            navigate(`/workspace-sessions?session=${encodeURIComponent(session.id)}`);
          }}
        />
      )}
    </>
  );
}
