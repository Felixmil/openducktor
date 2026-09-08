import {
  WORKSPACE_SESSION_MANUAL_TITLE_LIMIT,
  type WorkspaceSession,
} from "@openducktor/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";
import { host } from "@/state/operations/host";
import { updateWorkspaceSessionQueries } from "@/state/queries/workspace-sessions";

type WorkspaceSessionTitleInputProps = {
  workspaceId: string;
  record: WorkspaceSession;
};

export function WorkspaceSessionTitleInput({
  workspaceId,
  record,
}: WorkspaceSessionTitleInputProps): ReactElement {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(record.manualTitle ?? "");
  const rename = useMutation({
    mutationFn: (manualTitle: string) =>
      host.workspaceSessionRename({ workspaceId, sessionId: record.id, manualTitle }),
    onSuccess: (session) => updateWorkspaceSessionQueries(queryClient, workspaceId, session),
  });
  return (
    <div>
      <Input
        aria-label="Session title"
        value={draft}
        placeholder={record.generatedTitle ?? "Untitled session"}
        maxLength={WORKSPACE_SESSION_MANUAL_TITLE_LIMIT}
        disabled={rename.isPending}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== (record.manualTitle ?? "")) rename.mutate(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(record.manualTitle ?? "");
        }}
        className="h-7 border-transparent px-0 font-medium shadow-none placeholder:text-foreground"
      />
      {rename.error && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage(rename.error)}
        </p>
      )}
    </div>
  );
}
