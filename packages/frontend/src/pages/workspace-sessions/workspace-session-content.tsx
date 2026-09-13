import type { WorkspaceSession } from "@openducktor/contracts";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/errors";
import { useAgentSessionReadModelState } from "@/state/app-state-provider";
import { settingsSnapshotQueryOptions } from "@/state/queries/workspace";
import type { ActiveWorkspace } from "@/types/state-slices";
import { WorkspaceSessionChat } from "./workspace-session-chat";
import { WorkspaceSessionHeader } from "./workspace-session-header";

export function WorkspaceSessionReadModelNotice() {
  const { sessionReadModelLoadState, workspaceSessionRecordsError, reloadSessionReadModel } =
    useAgentSessionReadModelState();
  const error =
    sessionReadModelLoadState.kind === "failed"
      ? sessionReadModelLoadState.message
      : workspaceSessionRecordsError;
  if (!error) return null;
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-border p-3 text-sm">
      <span className="flex-1 text-destructive">Session data unavailable: {error}</span>
      <Button size="sm" variant="outline" onClick={reloadSessionReadModel}>
        Retry
      </Button>
    </div>
  );
}

export function WorkspaceSessionContent({
  workspace,
  record,
}: {
  workspace: ActiveWorkspace;
  record: WorkspaceSession;
}) {
  const settings = useQuery(settingsSnapshotQueryOptions());
  return (
    <TabsContent
      value={record.id}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card"
    >
      <WorkspaceSessionHeader workspaceId={workspace.workspaceId} record={record} />
      {settings.data && (
        <WorkspaceSessionChat
          workspace={workspace}
          record={record}
          chatSettings={settings.data.chat}
          reusablePrompts={settings.data.reusablePrompts}
        />
      )}
      {settings.isPending && (
        <p role="status" className="p-4">
          Loading chat settings…
        </p>
      )}
      {settings.isError && (
        <div role="alert" className="p-4">
          <p className="text-destructive">{errorMessage(settings.error)}</p>
          <Button onClick={() => void settings.refetch()}>Retry settings</Button>
        </div>
      )}
    </TabsContent>
  );
}
