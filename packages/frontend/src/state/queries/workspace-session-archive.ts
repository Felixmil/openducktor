import { queryOptions } from "@tanstack/react-query";
import { host } from "../operations/host";

export const workspaceSessionArchivePreviewQueryOptions = (
  workspaceId: string,
  sessionId: string,
) =>
  queryOptions({
    queryKey: ["workspace-session-archive-preview", workspaceId, sessionId] as const,
    queryFn: () => host.workspaceSessionArchivePreview({ workspaceId, sessionId }),
    staleTime: 0,
    retry: false,
  });
