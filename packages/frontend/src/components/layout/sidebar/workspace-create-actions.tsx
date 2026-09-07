import { MessageCirclePlus, Plus, StickyNote } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { TaskCreateModal } from "@/components/features/task-create/task-create-modal";
import { Button } from "@/components/ui/button";
import { useActiveWorkspace, useTasksState } from "@/state/app-state-provider";

export default function WorkspaceCreateActions({ compact = false }: { compact?: boolean }) {
  const [taskOpen, setTaskOpen] = useState(false);
  const { tasks } = useTasksState();
  const workspace = useActiveWorkspace();
  const navigate = useNavigate();
  return (
    <>
      <div className="flex flex-col gap-2">
        <Button
          size={compact ? "icon" : "default"}
          className={compact ? "size-8" : "w-full justify-start"}
          aria-label="Create task"
          title="Create task"
          disabled={!workspace}
          onClick={() => setTaskOpen(true)}
        >
          <span aria-hidden="true" className="relative size-4 shrink-0">
            <StickyNote className="size-4" />
            <Plus className="absolute left-0.5 top-0.5 size-2.5" />
          </span>
          {!compact && "Create task"}
        </Button>
        <Button
          variant="outline"
          size={compact ? "icon" : "default"}
          className={compact ? "size-8" : "w-full justify-start"}
          aria-label="Start workspace session"
          title="Start workspace session"
          disabled={!workspace}
          onClick={() => navigate("/workspace-sessions?create=session")}
        >
          <MessageCirclePlus />
          {!compact && "New session"}
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
