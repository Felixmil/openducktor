import type { CustomAgentRole } from "@openducktor/contracts";

export type CustomAgentRoleFieldErrors = { name?: string; systemPrompt?: string };
export type CustomAgentRoleValidationState = {
  errorsById: Record<string, CustomAgentRoleFieldErrors>;
  totalErrorCount: number;
};

export const createCustomAgentRoleDraft = (): CustomAgentRole => ({
  id: crypto.randomUUID(),
  name: "",
  systemPrompt: "",
});

export const validateCustomAgentRoleDrafts = (
  roles: CustomAgentRole[],
): CustomAgentRoleValidationState => {
  const errorsById: Record<string, CustomAgentRoleFieldErrors> = {};
  const names = new Map<string, string[]>();
  for (const role of roles) {
    const errors: CustomAgentRoleFieldErrors = {};
    const name = role.name.trim();
    if (!name) errors.name = "Role name is required.";
    if (!role.systemPrompt.trim()) errors.systemPrompt = "System prompt is required.";
    errorsById[role.id] = errors;
    if (name) {
      const key = name.toLowerCase();
      names.set(key, [...(names.get(key) ?? []), role.id]);
    }
  }
  for (const ids of names.values()) {
    if (ids.length < 2) continue;
    for (const id of ids)
      errorsById[id] = { ...errorsById[id], name: "Role names must be unique." };
  }
  return {
    errorsById,
    totalErrorCount: Object.values(errorsById).reduce(
      (count, errors) =>
        count + Number(Boolean(errors.name)) + Number(Boolean(errors.systemPrompt)),
      0,
    ),
  };
};
