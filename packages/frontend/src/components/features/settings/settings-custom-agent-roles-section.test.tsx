import { expect, test } from "bun:test";
import type { CustomAgentRole } from "@openducktor/contracts";
import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { validateCustomAgentRoleDrafts } from "@/state/read-models/custom-agent-role-settings";
import { SettingsCustomAgentRolesSection } from "./settings-custom-agent-roles-section";
import { SettingsReusablePromptsSection } from "./settings-reusable-prompts-section";

function RoleDraft({
  initial = [],
  disabled = false,
}: {
  initial?: CustomAgentRole[];
  disabled?: boolean;
}) {
  const [roles, setRoles] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <SettingsCustomAgentRolesSection
      roles={roles}
      selectedRoleId={selected}
      validation={validateCustomAgentRoleDrafts(roles)}
      disabled={disabled}
      onSelect={setSelected}
      onUpdate={setRoles}
    />
  );
}

test("adds local drafts, focuses the name, keeps edits across selection, and deletes the adjacent draft", () => {
  const view = render(<RoleDraft />);
  try {
    fireEvent.click(view.getByRole("button", { name: "Add custom agent role" }));
    expect(document.activeElement).toBe(view.getByLabelText("Name"));
    expect(view.getByText("Role name is required.")).toBeTruthy();
    fireEvent.change(view.getByLabelText("Name"), { target: { value: "Reviewer" } });
    fireEvent.change(view.getByLabelText("System prompt"), { target: { value: "Review code.\n" } });
    fireEvent.click(view.getByRole("button", { name: "Add role" }));
    expect(document.activeElement).toBe(view.getByLabelText("Name"));
    fireEvent.change(view.getByLabelText("Name"), { target: { value: "Researcher" } });
    fireEvent.click(view.getByRole("button", { name: "Reviewer" }));
    expect(view.container.querySelector("textarea")?.value).toBe("Review code.\n");
    fireEvent.click(view.getByRole("button", { name: "Delete" }));
    expect(view.getByRole("dialog", { name: "Delete custom agent role" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    expect(view.getByDisplayValue("Reviewer")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Delete" }));
    fireEvent.click(view.getByRole("button", { name: "Delete role" }));
    expect(view.getByDisplayValue("Researcher")).toBeTruthy();
    expect(view.queryByRole("dialog")).toBeNull();
    expect(view.queryByRole("button", { name: "Save role" })).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Delete" }));
    fireEvent.click(view.getByRole("button", { name: "Delete role" }));
    expect(view.getByText("Create your first custom agent role")).toBeTruthy();
  } finally {
    view.unmount();
  }
});

test("disables every role control while settings are saving", () => {
  const view = render(
    <RoleDraft disabled initial={[{ id: "one", name: "Reviewer", systemPrompt: "Review." }]} />,
  );
  try {
    for (const control of view.container.querySelectorAll("button, input, textarea")) {
      expect(control.hasAttribute("disabled")).toBe(true);
    }
  } finally {
    view.unmount();
  }
});

test("matches reusable prompt sidebar, editor, delete button, and textarea styles", () => {
  const roles = render(
    <RoleDraft initial={[{ id: "one", name: "Reviewer", systemPrompt: "Review." }]} />,
  );
  const prompts = render(
    <SettingsReusablePromptsSection
      reusablePrompts={[
        { id: "prompt", name: "review", description: "Review", content: "Review." },
      ]}
      selectedReusablePromptId="prompt"
      validationErrors={{}}
      disabled={false}
      onSelectedReusablePromptIdChange={() => {}}
      onUpdateReusablePrompts={() => {}}
    />,
  );
  try {
    expect(roles.container.firstElementChild?.className).toBe(
      prompts.container.firstElementChild?.className,
    );
    expect(roles.container.querySelector("aside")?.className).toBe(
      prompts.container.querySelector("aside")?.className,
    );
    expect(roles.container.querySelector("textarea")?.className).toBe(
      prompts.container.querySelector("textarea")?.className,
    );
    const roleButtons = Array.from(roles.container.querySelectorAll("button"));
    const promptButtons = Array.from(prompts.container.querySelectorAll("button"));
    expect(roleButtons.find((button) => button.textContent === "Delete")?.className).toBe(
      promptButtons.find((button) => button.textContent === "Delete")?.className,
    );
    const roleAdd = roleButtons.find((button) => button.textContent === "Add role");
    const promptAdd = promptButtons.find((button) => button.textContent === "Add prompt");
    expect(roleAdd?.className).toBe(promptAdd?.className);
    expect(roleAdd === roles.container.querySelector("aside")?.lastElementChild).toBe(true);
    expect(promptAdd === prompts.container.querySelector("aside")?.lastElementChild).toBe(true);
  } finally {
    roles.unmount();
    prompts.unmount();
  }
});
