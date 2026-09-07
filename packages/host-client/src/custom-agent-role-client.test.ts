import { expect, test } from "bun:test";
import type { HostCommandArgs, HostCommandName } from "@openducktor/contracts";
import { createHostClient } from "./index";

test("public client routes Custom Agent Role operations and validates returned records", async () => {
  const role = { id: "role-1", name: "Reviewer", systemPrompt: "Review code." };
  const calls: Array<{ command: HostCommandName; args: HostCommandArgs }> = [];
  const client = createHostClient(async (command, args, schema) => {
    calls.push({ command, args });
    if (command === "custom_agent_role_list") return schema.parse([role]);
    if (command === "custom_agent_role_delete") return schema.parse(null);
    return schema.parse(role);
  });
  const input = { name: role.name, systemPrompt: role.systemPrompt };
  expect(await client.customAgentRoleList()).toEqual([role]);
  expect(await client.customAgentRoleCreate(input)).toEqual(role);
  expect(await client.customAgentRoleUpdate(role.id, input)).toEqual(role);
  expect(await client.customAgentRoleDelete(role.id)).toBeUndefined();
  expect(calls).toEqual([
    { command: "custom_agent_role_list", args: undefined },
    { command: "custom_agent_role_create", args: { input } },
    { command: "custom_agent_role_update", args: { id: role.id, input } },
    { command: "custom_agent_role_delete", args: { id: role.id } },
  ]);
  const invalid = createHostClient(async (_command, _args, schema) =>
    schema.parse({ name: "Missing fields" }),
  );
  await expect(invalid.customAgentRoleCreate(input)).rejects.toThrow();
});
