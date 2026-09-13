import { customAgentRoleInputSchema, type CustomAgentRoleInput } from "@openducktor/contracts";
import { Effect } from "effect";
import { HostValidationError } from "../../effect/host-errors";
import type { SettingsConfigPort } from "../../ports/settings-config-port";
import { loadGlobalConfig, type WorkspaceSettingsService } from "./workspace-settings-model";

type CustomAgentRoleOperations = Pick<
  WorkspaceSettingsService,
  | "listCustomAgentRoles"
  | "createCustomAgentRole"
  | "updateCustomAgentRole"
  | "deleteCustomAgentRole"
>;

export const createCustomAgentRoleOperations = (
  settingsConfig: SettingsConfigPort,
): CustomAgentRoleOperations => {
  const saveRole = (id: string | null, input: CustomAgentRoleInput) =>
    Effect.gen(function* () {
      const parsed = yield* Effect.try({
        try: () => customAgentRoleInputSchema.parse(input),
        catch: (cause) =>
          new HostValidationError({
            message: "Custom Agent Role requires a name and system prompt.",
            cause,
          }),
      });
      const config = yield* loadGlobalConfig(settingsConfig);
      if (id !== null && !config.customAgentRoles.some((role) => role.id === id)) {
        return yield* Effect.fail(
          new HostValidationError({ message: `Custom Agent Role not found: ${id}`, field: "id" }),
        );
      }
      if (
        config.customAgentRoles.some(
          (role) => role.id !== id && role.name.toLowerCase() === parsed.name.toLowerCase(),
        )
      ) {
        return yield* Effect.fail(
          new HostValidationError({
            message: `A Custom Agent Role named "${parsed.name}" already exists.`,
            field: "name",
          }),
        );
      }
      const saved = { ...parsed, id: id ?? crypto.randomUUID() };
      const customAgentRoles = config.customAgentRoles.filter((role) => role.id !== id);
      customAgentRoles.push(saved);
      yield* settingsConfig.writeConfig({ ...config, customAgentRoles });
      return saved;
    });
  return {
    listCustomAgentRoles: () =>
      Effect.gen(function* () {
        const config = yield* loadGlobalConfig(settingsConfig);
        return [...config.customAgentRoles].sort((left, right) =>
          left.name.localeCompare(right.name),
        );
      }),
    createCustomAgentRole: (input) => saveRole(null, input),
    updateCustomAgentRole: (id, input) => saveRole(id, input),
    deleteCustomAgentRole: (id) =>
      Effect.gen(function* () {
        const config = yield* loadGlobalConfig(settingsConfig);
        if (!config.customAgentRoles.some((role) => role.id === id)) {
          return yield* Effect.fail(
            new HostValidationError({ message: `Custom Agent Role not found: ${id}`, field: "id" }),
          );
        }
        yield* settingsConfig.writeConfig({
          ...config,
          customAgentRoles: config.customAgentRoles.filter((role) => role.id !== id),
        });
      }),
  };
};
