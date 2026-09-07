import { expect, test } from "bun:test";
import type { CustomAgentRole, CustomAgentRoleInput } from "@openducktor/contracts";
import { act } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryProvider } from "@/lib/query-provider";
import { configureShellBridge, createUnavailableShellBridge } from "@/lib/shell-bridge";
import { createShellBridgeFixture } from "@/test-utils/focused-fixture";
import { SettingsCustomAgentRolesSection } from "./settings-custom-agent-roles-section";

test("selects saved roles, locks the list during update, and retains edits on failure", async () => {
  const roles: CustomAgentRole[] = [
    { id: "review", name: "Reviewer", systemPrompt: "Review code." },
    { id: "research", name: "Researcher", systemPrompt: "Research sources." },
  ];
  let rejectSave!: (error: Error) => void;
  configureShellBridge(
    createShellBridgeFixture({
      client: {
        customAgentRoleList: async () => roles,
        customAgentRoleUpdate: () =>
          new Promise((_, reject) => {
            rejectSave = reject;
          }),
      },
    }),
  );
  const view = render(
    <QueryProvider useIsolatedClient>
      <SettingsCustomAgentRolesSection disabled={false} />
    </QueryProvider>,
  );
  try {
    await view.findByRole("button", { name: "Researcher" }, { timeout: 800 });
    // SAFETY: Role name labels the editor's input element.
    expect((view.getByLabelText("Role name") as HTMLInputElement).value).toBe("Reviewer");
    fireEvent.click(view.getByRole("button", { name: "Researcher" }));
    // SAFETY: System prompt labels the editor's textarea element.
    expect((view.getByLabelText("System prompt") as HTMLTextAreaElement).value).toBe(
      "Research sources.",
    );
    fireEvent.change(view.getByLabelText("System prompt"), {
      target: { value: "Cite primary sources." },
    });
    fireEvent.click(view.getByRole("button", { name: "Save role" }));
    await waitFor(
      () =>
        expect(view.getByRole("button", { name: "Reviewer" }).hasAttribute("disabled")).toBe(true),
      { timeout: 800 },
    );
    await act(async () => {
      rejectSave(new Error("Role could not be saved"));
    });
    await view.findByText("Role could not be saved", {}, { timeout: 800 });
    // SAFETY: System prompt still labels the same textarea after the failed save.
    expect((view.getByLabelText("System prompt") as HTMLTextAreaElement).value).toBe(
      "Cite primary sources.",
    );
    expect(view.getByRole("button", { name: "Reviewer" }).hasAttribute("disabled")).toBe(false);
  } finally {
    view.unmount();
    configureShellBridge(createUnavailableShellBridge());
  }
});

test("locks role selection during Save and requires confirmation before deletion", async () => {
  const inputs: CustomAgentRoleInput[] = [];
  const deleted: string[] = [];
  let finish!: (role: CustomAgentRole) => void;
  configureShellBridge(
    createShellBridgeFixture({
      client: {
        customAgentRoleList: async () => [],
        customAgentRoleCreate: (input) => {
          inputs.push(input);
          return new Promise((resolve) => {
            finish = resolve;
          });
        },
        customAgentRoleDelete: async (id) => {
          deleted.push(id);
        },
      },
    }),
  );
  const view = render(
    <QueryProvider useIsolatedClient>
      <SettingsCustomAgentRolesSection disabled={false} />
    </QueryProvider>,
  );
  try {
    const create = await view.findByRole(
      "button",
      { name: "Create your first role" },
      { timeout: 800 },
    );
    expect(view.queryByLabelText("Role name")).toBeNull();
    fireEvent.click(create);
    const name = await view.findByLabelText("Role name", {}, { timeout: 800 });
    fireEvent.change(name, { target: { value: "Reviewer" } });
    fireEvent.change(view.getByLabelText("System prompt"), {
      target: { value: "Review the code." },
    });
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Save role" }));
    });
    await waitFor(
      () =>
        expect(view.getByRole("button", { name: "New role" }).hasAttribute("disabled")).toBe(true),
      { timeout: 800 },
    );
    expect(inputs).toEqual([{ name: "Reviewer", systemPrompt: "Review the code." }]);
    expect(view.getByLabelText("Role name").closest("fieldset")?.disabled).toBe(true);
    await act(async () => {
      finish({ id: "role-1", name: "Reviewer", systemPrompt: "Review the code." });
    });
    const remove = await view.findByRole("button", { name: "Delete role" }, { timeout: 800 });
    fireEvent.click(remove);
    expect(deleted).toEqual([]);
    const dialog = view.getByRole("dialog", { name: "Delete Reviewer?" });
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete role",
    );
    if (!confirm) throw new Error("Expected delete confirmation.");
    await act(async () => {
      fireEvent.click(confirm);
    });
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull(), { timeout: 800 });
    expect(deleted).toEqual(["role-1"]);
  } finally {
    view.unmount();
    configureShellBridge(createUnavailableShellBridge());
  }
});
