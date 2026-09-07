import type { WorkspaceSession } from "@openducktor/contracts";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { host } from "../operations/host";

export const workspaceSessionQueryKeys = {
  all: ["workspace-sessions"] as const,
  list: (workspaceId: string, archived: boolean) =>
    ["workspace-sessions", workspaceId, archived ? "archived" : "active"] as const,
};

export const workspaceSessionListQueryOptions = (
  workspaceId: string,
  archived = false,
  readPort: Pick<typeof host, "workspaceSessionListActive" | "workspaceSessionListArchived"> = host,
) =>
  queryOptions({
    queryKey: workspaceSessionQueryKeys.list(workspaceId, archived),
    queryFn: () =>
      archived
        ? readPort.workspaceSessionListArchived(workspaceId)
        : readPort.workspaceSessionListActive(workspaceId),
    gcTime: Number.POSITIVE_INFINITY,
    staleTime: 0,
    retry: false,
  });

/** Cancel older reads before accepting ordered host metadata events or mutation results. */
export const updateWorkspaceSessionQueries = (
  queryClient: QueryClient,
  workspaceId: string,
  session: WorkspaceSession,
): void => {
  for (const archived of [false, true]) {
    const queryKey = workspaceSessionQueryKeys.list(workspaceId, archived);
    void queryClient.cancelQueries({ queryKey, exact: true });
    if (queryClient.getQueryData(queryKey) === undefined) {
      void queryClient.invalidateQueries({ queryKey, exact: true });
      continue;
    }
    queryClient.setQueryData<WorkspaceSession[]>(queryKey, (current) => {
      if (!current) return undefined;
      const next = current.filter((entry) => entry.id !== session.id);
      if ((session.archivedAt !== null) === archived) next.push(session);
      next.sort((left, right) =>
        archived
          ? (right.archivedAt ?? 0) - (left.archivedAt ?? 0)
          : right.updatedAt - left.updatedAt,
      );
      return archived ? next.slice(0, 100) : next;
    });
  }
};

export const customAgentRolesQueryOptions = () =>
  queryOptions({
    queryKey: ["custom-agent-roles"] as const,
    queryFn: () => host.customAgentRoleList(),
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
