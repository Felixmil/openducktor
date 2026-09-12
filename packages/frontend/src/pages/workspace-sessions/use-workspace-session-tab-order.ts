import type { WorkspaceSession } from "@openducktor/contracts";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { HorizontalTabDropPosition } from "@/components/ui/use-horizontal-sortable-tabs";
import { errorMessage } from "@/lib/errors";
import { scheduleTask } from "@/lib/scheduling";

export const workspaceSessionTabOrderStorageKey = (workspaceId: string): string =>
  `openducktor:workspace-sessions:tab-order:v1:${workspaceId}`;

const tabOrderSchema = z.array(z.string());

const readOrder = (key: string): string[] => {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return [];
    return tabOrderSchema.parse(JSON.parse(stored));
  } catch (cause) {
    throw new Error(`Could not read chat tab order "${key}": ${errorMessage(cause)}`, { cause });
  }
};

// The page remounts this hook when workspaceId changes.
export function useWorkspaceSessionTabOrder(
  workspaceId: string,
  records: WorkspaceSession[] | undefined,
) {
  const key = workspaceSessionTabOrderStorageKey(workspaceId);
  const [order, setOrder] = useState(() => readOrder(key));
  const [persistenceError, setPersistenceError] = useState<Error | null>(null);
  const byId = new Map(records?.map((record) => [record.id, record]));
  const known = new Set(order);
  const added = (records ?? [])
    .filter((record) => !known.has(record.id))
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((record) => record.id);
  const next = records ? [...order.filter((id) => byId.has(id)), ...added] : order;
  const changed = next.length !== order.length || next.some((id, index) => id !== order[index]);
  if (changed) setOrder(next);
  const loaded = records !== undefined;

  useEffect(() => {
    if (!loaded) return;
    let pending = true;
    let cancel = () => {};
    const flush = () => {
      if (!pending) return;
      pending = false;
      cancel();
      try {
        localStorage.setItem(key, JSON.stringify(order));
      } catch (cause) {
        setPersistenceError(
          new Error(`Could not save chat tab order "${key}": ${errorMessage(cause)}`, { cause }),
        );
      }
    };
    cancel = scheduleTask(flush, 0);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flush();
    };
  }, [key, loaded, order]);

  const reorder = (draggedId: string, targetId: string, position: HorizontalTabDropPosition) => {
    setOrder((current) => {
      if (draggedId === targetId || !current.includes(draggedId) || !current.includes(targetId)) {
        return current;
      }
      const reordered = current.filter((id) => id !== draggedId);
      const targetIndex = reordered.indexOf(targetId);
      reordered.splice(targetIndex + (position === "after" ? 1 : 0), 0, draggedId);
      return reordered;
    });
  };

  if (persistenceError) throw persistenceError;
  return {
    sessions: next.flatMap((id) => {
      const record = byId.get(id);
      return record ? [record] : [];
    }),
    reorder,
  };
}
