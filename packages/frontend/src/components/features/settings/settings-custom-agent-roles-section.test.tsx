import { expect, test } from "bun:test";
import type { CustomAgentRole, CustomAgentRoleInput } from "@openducktor/contracts";
import { act } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryProvider } from "@/lib/query-provider";
import { configureShellBridge, createUnavailableShellBridge } from "@/lib/shell-bridge";
import { createShellBridgeFixture } from "@/test-utils/focused-fixture";
import { SettingsCustomAgentRolesSection } from "./settings-custom-agent-roles-section";

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
    expect(
      view.getByRole("button", { name: "Choose a role to edit" }).hasAttribute("disabled"),
    ).toBe(true);
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
