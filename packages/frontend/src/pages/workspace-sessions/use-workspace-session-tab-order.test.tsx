import { expect, test } from "bun:test";
import type { WorkspaceSession } from "@openducktor/contracts";
import { act, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import {
  useWorkspaceSessionTabOrder,
  workspaceSessionTabOrderStorageKey,
} from "./use-workspace-session-tab-order";

const record = (id: string, createdAt: number): WorkspaceSession => ({
  id,
  createdAt,
  updatedAt: createdAt,
  runtimeKind: "codex",
  externalSessionId: null,
  executionTarget: { kind: "local_repo_root", workingDirectory: "/repo" },
  roleSnapshot: null,
  selectedModel: null,
  generatedTitle: null,
  manualTitle: id,
  archivedAt: null,
});

test("manual order commits before storage and survives updates, reload, archive, and restore", () => {
  const workspaceId = crypto.randomUUID();
  const key = workspaceSessionTabOrderStorageKey(workspaceId);
  const first = record("first", 1000);
  const second = record("second", 2000);
  const third = record("third", 3000);
  const commits: Array<string | null> = [];
  localStorage.setItem(key, JSON.stringify(["first", "second"]));
  const h = renderHook<
    ReturnType<typeof useWorkspaceSessionTabOrder>,
    WorkspaceSession[] | undefined
  >(
    (records: WorkspaceSession[] | undefined) => {
      const result = useWorkspaceSessionTabOrder(workspaceId, records);
      useLayoutEffect(() => {
        commits.push(localStorage.getItem(key));
      });
      return result;
    },
    { initialProps: [second, first] },
  );
  const ids = () => h.result.current.sessions.map((session) => session.id);
  try {
    expect(ids()).toEqual(["first", "second"]);
    act(() => h.result.current.reorder("second", "first", "before"));
    expect(ids()).toEqual(["second", "first"]);
    expect(commits.at(-1)).toBe(JSON.stringify(["first", "second"]));
    h.rerender([{ ...first, externalSessionId: "native-first", updatedAt: 9000 }, third, second]);
    expect(ids()).toEqual(["second", "first", "third"]);
    h.rerender([third, first]);
    expect(ids()).toEqual(["first", "third"]);
    h.rerender([second, third, first]);
    expect(ids()).toEqual(["first", "third", "second"]);
    act(() => h.result.current.reorder("first", "second", "after"));
    expect(ids()).toEqual(["third", "second", "first"]);
    h.unmount();
    expect(localStorage.getItem(key)).toBe(JSON.stringify(["third", "second", "first"]));
    const restored = renderHook(() =>
      useWorkspaceSessionTabOrder(workspaceId, [first, second, third]),
    );
    try {
      expect(restored.result.current.sessions.map((session) => session.id)).toEqual([
        "third",
        "second",
        "first",
      ]);
    } finally {
      restored.unmount();
    }
  } finally {
    h.unmount();
    localStorage.removeItem(key);
  }
});

test("loading preserves saved order and an empty loaded list clears it", () => {
  const workspaceId = crypto.randomUUID();
  const key = workspaceSessionTabOrderStorageKey(workspaceId);
  localStorage.setItem(key, JSON.stringify(["second", "first"]));
  const h = renderHook<
    ReturnType<typeof useWorkspaceSessionTabOrder>,
    WorkspaceSession[] | undefined
  >(
    (records: WorkspaceSession[] | undefined) => useWorkspaceSessionTabOrder(workspaceId, records),
    { initialProps: undefined },
  );
  try {
    expect(localStorage.getItem(key)).toBe(JSON.stringify(["second", "first"]));
    h.rerender([record("first", 1000), record("second", 2000)]);
    expect(h.result.current.sessions.map((session) => session.id)).toEqual(["second", "first"]);
    act(() => h.result.current.reorder("missing", "first", "before"));
    expect(h.result.current.sessions.map((session) => session.id)).toEqual(["second", "first"]);
    h.rerender([]);
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(localStorage.getItem(key)).toBe("[]");
  } finally {
    h.unmount();
    localStorage.removeItem(key);
  }
});
