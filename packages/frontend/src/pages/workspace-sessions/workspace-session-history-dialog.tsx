import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/errors";
import { invalidateRepoBranchesQuery } from "@/state/queries/git";
import { host } from "@/state/operations/host";
import { workspaceSessionTitle } from "@/state/operations/agent-orchestrator/session-read-model/workspace-session-records";
import {
  updateWorkspaceSessionQueries,
  workspaceSessionListQueryOptions,
} from "@/state/queries/workspace-sessions";

export function WorkspaceSessionHistoryDialog({
  workspaceId,
  repoPath,
  onClose,
}: {
  workspaceId: string;
  repoPath: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const archived = useQuery(workspaceSessionListQueryOptions(workspaceId, true));
  const [filter, setFilter] = useState("");
  const search = filter.trim().toLowerCase();
  const filteredSessions = archived.data?.filter((record) =>
    [
      workspaceSessionTitle(record),
      record.roleSnapshot?.name ?? "No role",
      record.executionTarget.workingDirectory,
    ].some((value) => value.toLowerCase().includes(search)),
  );
  const restore = useMutation({
    mutationFn: (sessionId: string) => host.workspaceSessionRestore({ workspaceId, sessionId }),
    onSuccess: (session) => updateWorkspaceSessionQueries(queryClient, workspaceId, session),
    onSettled: () => {
      void invalidateRepoBranchesQuery(queryClient, repoPath);
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archived chats</DialogTitle>
          <DialogDescription>Restore a chat to return it to your workspace.</DialogDescription>
        </DialogHeader>
        <Input
          type="search"
          aria-label="Filter archived chats"
          placeholder="Filter by title, role, or path…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="mt-4 shrink-0"
        />
        <DialogBody className="mt-4 flex max-h-96 flex-col gap-2">
          {archived.isPending && <p role="status">Loading archived sessions…</p>}
          {archived.isError && (
            <div role="alert">
              <p className="text-sm text-destructive">{errorMessage(archived.error)}</p>
              <Button variant="outline" onClick={() => void archived.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {restore.error && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(restore.error)}
            </p>
          )}
          {filteredSessions?.map((record) => (
            <div
              key={record.id}
              className="flex items-center gap-4 rounded-lg border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{workspaceSessionTitle(record)}</p>
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={record.executionTarget.workingDirectory}
                >
                  {record.roleSnapshot?.name ?? "No role"} ·{" "}
                  {record.executionTarget.workingDirectory}
                </p>
                {record.executionTarget.kind === "local_worktree" &&
                  record.executionTarget.worktreeState === "removed" && (
                    <p className="text-xs text-muted-foreground">
                      Worktree removed. Restore recreates it from the default branch.
                    </p>
                  )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={restore.isPending}
                aria-label={`Restore ${workspaceSessionTitle(record)}`}
                onClick={() => restore.mutate(record.id)}
              >
                {restore.isPending && restore.variables === record.id ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <RotateCcw />
                )}
                Restore
              </Button>
            </div>
          ))}
          {archived.data?.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No archived sessions.</p>
          )}
          {archived.data && archived.data.length > 0 && filteredSessions?.length === 0 && (
            <p role="status" className="py-6 text-center text-sm text-muted-foreground">
              No chats match your filter.
            </p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
