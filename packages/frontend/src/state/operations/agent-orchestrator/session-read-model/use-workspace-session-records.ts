import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { subscribeWorkspaceSessionUpdates } from "@/lib/host-client";
import { errorMessage } from "@/lib/errors";
import { BROWSER_LIVE_STREAM_WARNING_EVENT_KIND } from "@/lib/browser-live/constants";
import {
  workspaceSessionListQueryOptions,
  workspaceSessionQueryKeys,
  updateWorkspaceSessionQueries,
} from "@/state/queries/workspace-sessions";

export const useWorkspaceSessionRecords = (
  workspaceId: string | null,
  queryClient: QueryClient,
  reloadGeneration: number,
) => {
  const records = useQuery(
    {
      ...workspaceSessionListQueryOptions(workspaceId ?? ""),
      enabled: workspaceId !== null,
    },
    queryClient,
  );
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  useEffect(() => {
    if (workspaceId === null) return;
    let closed = false;
    let unsubscribe: (() => void) | undefined;
    void subscribeWorkspaceSessionUpdates((event) => {
      if (closed) return;
      if ("__openducktorBrowserLive" in event) {
        if (event.kind === BROWSER_LIVE_STREAM_WARNING_EVENT_KIND) {
          setSubscriptionError(event.message ?? "Workspace Session updates are unavailable.");
        } else {
          setSubscriptionError(null);
          void queryClient.invalidateQueries({ queryKey: workspaceSessionQueryKeys.all });
        }
        return;
      }
      setSubscriptionError(null);
      updateWorkspaceSessionQueries(queryClient, event.workspaceId, event.session);
    })
      .then((stop) => {
        if (closed) stop();
        else {
          unsubscribe = stop;
          setSubscriptionError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!closed) setSubscriptionError(errorMessage(cause));
      });
    return () => {
      closed = true;
      unsubscribe?.();
    };
  }, [queryClient, reloadGeneration, workspaceId]);
  return { records, subscriptionError };
};
