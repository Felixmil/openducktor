import type { WorkspaceSession } from "@openducktor/contracts";
import { HostInvokeError } from "@openducktor/host-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, GitBranch, History, LoaderCircle, MessageCirclePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getAgentSessionActivityStateFromSession,
  isAgentSessionActivityActive,
} from "@/lib/agent-session-activity-state";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  useActiveWorkspace,
  useAgentSession,
  useAgentSessionReadModelState,
} from "@/state/app-state-provider";
import { host } from "@/state/operations/host";
import {
  workspaceSessionIdentity,
  workspaceSessionTitle,
} from "@/state/operations/agent-orchestrator/session-read-model/workspace-session-records";
import { settingsSnapshotQueryOptions } from "@/state/queries/workspace";
import {
  updateWorkspaceSessionQueries,
  workspaceSessionListQueryOptions,
} from "@/state/queries/workspace-sessions";
import type { ActiveWorkspace } from "@/types/state-slices";
import { WorkspaceSessionChat } from "./workspace-session-chat";
import { WorkspaceSessionCreateDialog } from "./workspace-session-create-dialog";
import { WorkspaceSessionHistoryDialog } from "./workspace-session-history-dialog";
import { WorkspaceSessionTitleInput } from "./workspace-session-title-input";

function WorkspaceSessionTab({
  record,
  selected,
  pending,
  onArchive,
}: {
  record: WorkspaceSession;
  selected: boolean;
  pending: boolean;
  onArchive: (record: WorkspaceSession, running: boolean) => void;
}) {
  const session = useAgentSession(workspaceSessionIdentity(record));
  const { sessionReadModelLoadState } = useAgentSessionReadModelState();
  const statusAvailable = sessionReadModelLoadState.kind === "ready";
  const activity =
    session && statusAvailable ? getAgentSessionActivityStateFromSession(session) : null;
  const statusLabel = statusAvailable ? (activity ?? "idle") : "Status unavailable";
  const running = isAgentSessionActivityActive(activity);
  const title = workspaceSessionTitle(record);
  return (
    <div
      className={cn(
        "group relative inline-flex h-8 shrink-0 items-center gap-1 rounded-t-[10px] pl-2 pr-1",
        selected ? "bg-card text-foreground" : "bg-secondary text-foreground hover:bg-muted",
      )}
    >
      <TabsTrigger
        value={record.id}
        title={title}
        className="h-7 max-w-[19rem] justify-start gap-2 rounded-t-[8px] border-none bg-transparent px-0 pr-1 text-sm text-inherit data-[state=active]:bg-transparent data-[state=active]:shadow-none"
      >
        <span
          aria-label={statusLabel}
          className={cn(
            "mx-1 size-2 shrink-0 rounded-full bg-input",
            running && "bg-emerald-500",
            activity === "waiting_input" && "bg-amber-500",
            activity === "error" && "bg-rose-500",
          )}
        />
        <span className="max-w-48 truncate">{title}</span>
      </TabsTrigger>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        aria-label={`Archive ${title}`}
        title={`Archive ${title}`}
        disabled={pending}
        onClick={() => onArchive(record, running)}
      >
        <Archive />
      </Button>
    </div>
  );
}

function WorkspaceSessions({ workspace }: { workspace: ActiveWorkspace }) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const records = useQuery(workspaceSessionListQueryOptions(workspace.workspaceId));
  const settings = useQuery(settingsSnapshotQueryOptions());
  const [selectedId, setSelectedId] = useState<string | null | undefined>(
    () => params.get("session") ?? undefined,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<WorkspaceSession | null>(null);
  const { sessionReadModelLoadState, reloadSessionReadModel } = useAgentSessionReadModelState();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (
    records.data &&
    (selectedId === undefined ||
      (selectedId !== null && !records.data.some((record) => record.id === selectedId)))
  ) {
    setSelectedId(records.data[0]?.id ?? null);
  }
  const selected = records.data?.find((record) => record.id === selectedId) ?? null;
  const archive = useMutation({
    mutationFn: (input: { sessionId: string; confirmStop: boolean }) =>
      host.workspaceSessionArchive({ workspaceId: workspace.workspaceId, ...input }),
    onSuccess: (record) => {
      updateWorkspaceSessionQueries(queryClient, workspace.workspaceId, record);
      if (!mounted.current) return;
      setArchiveTarget(null);
      if (selectedId === record.id)
        setSelectedId(records.data?.find((entry) => entry.id !== record.id)?.id ?? null);
    },
    onError: (cause, input) => {
      if (
        mounted.current &&
        cause instanceof HostInvokeError &&
        cause.failure?.kind === "workspace_session_confirmation" &&
        cause.failure.field === "confirmStop"
      ) {
        setArchiveTarget(records.data?.find((entry) => entry.id === input.sessionId) ?? null);
      }
    },
  });
  const setCreating = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set("create", "session");
    else next.delete("create");
    setParams(next, { replace: true });
  };
  if (records.isPending)
    return (
      <p role="status" className="p-6 text-muted-foreground">
        Loading Workspace Sessions…
      </p>
    );
  if (records.isError)
    return (
      <div role="alert" className="space-y-3 p-6">
        <p className="text-destructive">
          Could not load Workspace Sessions: {errorMessage(records.error)}
        </p>
        <Button variant="outline" onClick={() => void records.refetch()}>
          Retry
        </Button>
      </div>
    );
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 bg-studio-chrome px-2 pt-1">
        <Tabs
          value={selectedId ?? ""}
          onValueChange={setSelectedId}
          className="min-w-0 flex-1 overflow-x-auto"
        >
          <TabsList
            aria-label="Workspace session tabs"
            className="h-auto min-h-8 w-max justify-start gap-1 rounded-none bg-transparent p-0"
          >
            {records.data.map((record) => (
              <WorkspaceSessionTab
                key={record.id}
                record={record}
                selected={record.id === selectedId}
                pending={archive.isPending}
                onArchive={(target, running) => {
                  archive.reset();
                  if (running) setArchiveTarget(target);
                  else archive.mutate({ sessionId: target.id, confirmStop: false });
                }}
              />
            ))}
          </TabsList>
        </Tabs>
        <Button
          variant="ghost"
          size="icon"
          className="mb-1 size-8 shrink-0"
          aria-label="Session history"
          title="Archived sessions"
          onClick={() => setHistoryOpen(true)}
        >
          <History />
        </Button>
      </div>
      {sessionReadModelLoadState.kind === "failed" && (
        <div role="alert" className="flex items-center gap-3 border-b border-border p-3 text-sm">
          <span className="flex-1 text-destructive">
            Status unavailable: {sessionReadModelLoadState.message}
          </span>
          <Button size="sm" variant="outline" onClick={reloadSessionReadModel}>
            Retry
          </Button>
        </div>
      )}
      {archive.error && !archiveTarget && (
        <p role="alert" className="p-3 text-sm text-destructive">
          {errorMessage(archive.error)}
        </p>
      )}
      {selected ? (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card">
          <div className="border-b border-border px-4 py-2">
            <WorkspaceSessionTitleInput
              key={selected.id}
              workspaceId={workspace.workspaceId}
              record={selected}
            />
            <p
              className="flex items-center gap-1 truncate text-xs text-muted-foreground"
              title={selected.executionTarget.workingDirectory}
            >
              <GitBranch className="size-3 shrink-0" />
              {selected.executionTarget.workingDirectory} ·{" "}
              {selected.roleSnapshot?.name ?? "No Role"}
            </p>
          </div>
          {settings.data && (
            <WorkspaceSessionChat
              key={selected.id}
              workspace={workspace}
              record={selected}
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
        </section>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-card">
          <p className="text-muted-foreground">
            {records.data.length ? "Select a session above." : "No active sessions."}
          </p>
          <Button onClick={() => setCreating(true)}>
            <MessageCirclePlus />
            New session
          </Button>
        </section>
      )}
      {historyOpen && (
        <WorkspaceSessionHistoryDialog
          workspaceId={workspace.workspaceId}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {params.get("create") === "session" && (
        <WorkspaceSessionCreateDialog
          workspace={workspace}
          onClose={() => setCreating(false)}
          onCreated={(record) => {
            if (mounted.current) {
              setSelectedId(record.id);
              setCreating(false);
            }
          }}
        />
      )}
      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open && !archive.isPending) {
            setArchiveTarget(null);
            archive.reset();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Stop and archive session?</DialogTitle>
            <DialogDescription>
              {archiveTarget && workspaceSessionTitle(archiveTarget)} is running. Stop the agent
              before archiving. You can restore the session later.
            </DialogDescription>
          </DialogHeader>
          {archive.error && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(archive.error)}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={archive.isPending}
              onClick={() => {
                setArchiveTarget(null);
                archive.reset();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={archive.isPending}
              onClick={() => {
                if (archiveTarget)
                  archive.mutate({ sessionId: archiveTarget.id, confirmStop: true });
              }}
            >
              {archive.isPending && <LoaderCircle className="animate-spin" />}Stop and archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function WorkspaceSessionsPage() {
  const workspace = useActiveWorkspace();
  if (!workspace) return <p className="p-6">Select a workspace.</p>;
  return <WorkspaceSessions key={workspace.workspaceId} workspace={workspace} />;
}
