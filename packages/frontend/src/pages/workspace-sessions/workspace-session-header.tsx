import type { WorkspaceSession } from "@openducktor/contracts";
import { GitBranch, MoreHorizontal, Pencil } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { workspaceSessionTitle } from "@/state/operations/agent-orchestrator/session-read-model/workspace-session-records";
import { WorkspaceSessionRenameDialog } from "./workspace-session-rename-dialog";

type Props = { workspaceId: string; record: WorkspaceSession };

export function WorkspaceSessionHeader({ workspaceId, record }: Props): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const actionsButton = useRef<HTMLButtonElement>(null);
  const title = workspaceSessionTitle(record);
  return (
    <div className="border-b border-border px-4 py-2">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-sm font-medium" title={title}>
          {title}
        </h2>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              ref={actionsButton}
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="Session actions"
              title="Session actions"
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-40 p-1.5"
            onCloseAutoFocus={(event) => {
              if (renaming) event.preventDefault();
            }}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setMenuOpen(false);
                setRenaming(true);
              }}
            >
              <Pencil aria-hidden="true" />
              Rename
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      <p
        className="flex items-center gap-1 truncate text-xs text-muted-foreground"
        title={record.executionTarget.workingDirectory}
      >
        <GitBranch className="size-3 shrink-0" />
        <span className="min-w-0 truncate">{record.executionTarget.workingDirectory}</span>
        <span className="shrink-0">· {record.roleSnapshot?.name ?? "No role"}</span>
      </p>
      {renaming && (
        <WorkspaceSessionRenameDialog
          workspaceId={workspaceId}
          record={record}
          onClose={() => setRenaming(false)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            actionsButton.current?.focus();
          }}
        />
      )}
    </div>
  );
}
