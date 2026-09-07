import { describe, expect, test } from "bun:test";
import type { WorkspaceSession } from "@openducktor/contracts";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { act } from "react";
import { QueryProvider } from "@/lib/query-provider";
import { configureShellBridge, createUnavailableShellBridge } from "@/lib/shell-bridge";
import { createShellBridgeFixture } from "@/test-utils/focused-fixture";
import { WorkspaceSessionHistoryDialog } from "./workspace-session-history-dialog";
import { WorkspaceSessionTitleInput } from "./workspace-session-title-input";

const record = (): WorkspaceSession => ({
  id: "session-1",
  runtimeKind: "codex",
  externalSessionId: "native-1",
  executionTarget: { kind: "local_repo_root", workingDirectory: "/repo" },
  roleSnapshot: { id: "role", name: "Reviewer", systemPrompt: "Review the code." },
  selectedModel: null,
  generatedTitle: "Generated title",
  manualTitle: "My session",
  createdAt: 1000,
  updatedAt: 1000,
  archivedAt: null,
});

describe("Workspace Session metadata UI", () => {
  test("History is restore-only and disables restoration while the command is pending", async () => {
    const archived = { ...record(), archivedAt: 2000 };
    const requests: Array<{ workspaceId: string; sessionId: string }> = [];
    let finish!: (session: WorkspaceSession) => void;
    configureShellBridge(
      createShellBridgeFixture({
        client: {
          workspaceSessionListArchived: async () => [archived],
          workspaceSessionRestore: (input) => {
            requests.push(input);
            return new Promise((resolve) => {
              finish = resolve;
            });
          },
        },
      }),
    );
    const view = render(
      <QueryProvider useIsolatedClient>
        <WorkspaceSessionHistoryDialog workspaceId="A" onClose={() => {}} />
      </QueryProvider>,
    );
    try {
      const restore = await view.findByRole(
        "button",
        { name: "Restore My session" },
        { timeout: 800 },
      );
      expect(view.queryByRole("textbox")).toBeNull();
      expect(view.queryByRole("link")).toBeNull();
      await act(async () => {
        fireEvent.click(restore);
      });
      await waitFor(() => expect(restore.hasAttribute("disabled")).toBe(true), { timeout: 800 });
      expect(requests).toEqual([{ workspaceId: "A", sessionId: "session-1" }]);
      await act(async () => {
        finish(record());
      });
      await view.findByText("No archived sessions.", {}, { timeout: 800 });
      expect(view.queryByRole("textbox")).toBeNull();
    } finally {
      view.unmount();
      configureShellBridge(createUnavailableShellBridge());
    }
  });

  test("History keeps the archived row and reports a failed restore", async () => {
    configureShellBridge(
      createShellBridgeFixture({
        client: {
          workspaceSessionListArchived: async () => [{ ...record(), archivedAt: 2000 }],
          workspaceSessionRestore: async () => {
            throw new Error("Worktree directory is missing.");
          },
        },
      }),
    );
    const view = render(
      <QueryProvider useIsolatedClient>
        <WorkspaceSessionHistoryDialog workspaceId="A" onClose={() => {}} />
      </QueryProvider>,
    );
    try {
      fireEvent.click(
        await view.findByRole("button", { name: "Restore My session" }, { timeout: 800 }),
      );
      await view.findByText("Worktree directory is missing.", {}, { timeout: 800 });
      expect(
        view.getByRole("button", { name: "Restore My session" }).hasAttribute("disabled"),
      ).toBe(false);
    } finally {
      view.unmount();
      configureShellBridge(createUnavailableShellBridge());
    }
  });

  test("a failed rename retains the draft and permits a second save", async () => {
    const saved: string[] = [];
    configureShellBridge(
      createShellBridgeFixture({
        client: {
          workspaceSessionRename: async (input) => {
            saved.push(input.manualTitle ?? "");
            if (saved.length === 1) throw new Error("Database unavailable");
            return { ...record(), manualTitle: input.manualTitle };
          },
        },
      }),
    );
    const view = render(
      <QueryProvider useIsolatedClient>
        <WorkspaceSessionTitleInput workspaceId="A" record={record()} />
      </QueryProvider>,
    );
    try {
      const title = view.getByRole("textbox", { name: "Session title" });
      fireEvent.change(title, { target: { value: "Updated name" } });
      fireEvent.blur(title);
      await view.findByText("Database unavailable", {}, { timeout: 800 });
      if (!(title instanceof HTMLInputElement)) throw new Error("Expected the title input.");
      expect(title.value).toBe("Updated name");
      fireEvent.blur(title);
      await waitFor(() => expect(saved).toEqual(["Updated name", "Updated name"]), {
        timeout: 800,
      });
      await waitFor(() => expect(view.queryByText("Database unavailable")).toBeNull(), {
        timeout: 800,
      });
    } finally {
      view.unmount();
      configureShellBridge(createUnavailableShellBridge());
    }
  });
});
