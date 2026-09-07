import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/errors";
import { host } from "@/state/operations/host";
import { workspaceSessionTitle } from "@/state/operations/agent-orchestrator/session-read-model/workspace-session-records";
import {
  updateWorkspaceSessionQueries,
  workspaceSessionListQueryOptions,
} from "@/state/queries/workspace-sessions";

export function WorkspaceSessionHistoryDialog({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const archived = useQuery(workspaceSessionListQueryOptions(workspaceId, true));
  const restore = useMutation({
    mutationFn: (sessionId: string) => host.workspaceSessionRestore({ workspaceId, sessionId }),
    onSuccess: (session) => updateWorkspaceSessionQueries(queryClient, workspaceId, session),
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
          <DialogTitle>Archived sessions</DialogTitle>
          <DialogDescription>Restore a session to return it to your workspace.</DialogDescription>
        </DialogHeader>
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
          {archived.data?.map((record) => (
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
                  {record.roleSnapshot?.name ?? "No Role"} ·{" "}
                  {record.executionTarget.workingDirectory}
                </p>
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
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
