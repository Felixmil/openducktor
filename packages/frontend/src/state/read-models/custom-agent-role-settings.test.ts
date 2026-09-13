import { expect, test } from "bun:test";
import {
  createCustomAgentRoleDraft,
  validateCustomAgentRoleDrafts,
} from "./custom-agent-role-settings";

test("role drafts have distinct IDs and validate blank fields without trimming the draft", () => {
  const first = createCustomAgentRoleDraft();
  const second = createCustomAgentRoleDraft();
  expect(first.id).not.toBe(second.id);
  first.name = "   ";
  first.systemPrompt = "\n";
  expect(validateCustomAgentRoleDrafts([first]).errorsById[first.id]).toEqual({
    name: "Role name is required.",
    systemPrompt: "System prompt is required.",
  });
  expect(first.name).toBe("   ");
  expect(first.systemPrompt).toBe("\n");
});

test("reports every duplicate name and accepts distinct valid roles", () => {
  const roles = [
    { id: "one", name: " Reviewer ", systemPrompt: "Review." },
    { id: "two", name: "reviewer", systemPrompt: "Check." },
  ];
  const invalid = validateCustomAgentRoleDrafts(roles);
  expect(invalid.totalErrorCount).toBe(2);
  expect(invalid.errorsById.one?.name).toBe("Role names must be unique.");
  expect(invalid.errorsById.two?.name).toBe("Role names must be unique.");
  expect(
    validateCustomAgentRoleDrafts(roles.map((role) => ({ ...role, name: role.id })))
      .totalErrorCount,
  ).toBe(0);
});
