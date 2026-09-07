import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import {
  OPENCODE_RUNTIME_DESCRIPTOR,
  type AgentSessionControlStartInput,
  type AgentSessionLiveReadResult,
  type WorkspaceSessionCreateInput,
  repoConfigSchema,
} from "@openducktor/contracts";
import { Effect, Fiber, Option } from "effect";
import { createRuntimeRegistry } from "../../adapters/runtimes/runtime-registry";
import {
  createSqliteTaskStoreHarness,
  type SqliteTaskStoreTestHarness,
} from "../../adapters/sqlite/sqlite-task-store-test-support";
import { createSqliteWorkspaceSessionStore } from "../../adapters/sqlite/sqlite-workspace-session-store";
import { HostOperationError } from "../../effect/host-errors";
import {
  createGitPortTestDouble,
  createSettingsConfigTestDouble,
  createWorktreeFilePortTestDouble,
} from "../../test-support/service-test-doubles";
import {
  createWorkspaceSessionService,
  type WorkspaceSessionServiceDependencies,
} from "./workspace-session-service";

const input = (): WorkspaceSessionCreateInput => ({
  workspaceId: "fairnest",
  runtimeKind: "opencode",
  selectedModel: {
    runtimeKind: "opencode",
    providerId: "provider",
    modelId: "model",
    variant: "high",
    profileId: "profile",
  },
  customAgentRoleId: "role-1",
  location: "local_repo_root",
  manualTitle: "  My   session  ",
  confirmUncommittedChanges: false,
});

describe("host-owned Workspace Session lifecycle", () => {
  let database: SqliteTaskStoreTestHarness;
  beforeEach(async () => {
    database = await createSqliteTaskStoreHarness();
  });
  afterEach(async () => {
    await database.cleanup();
  });

  const setup = () => {
    const calls: string[] = [];
    const starts: AgentSessionControlStartInput[] = [];
    const paths = new Set<string>();
    const branches = new Set<string>();
    const registered = new Set<string>();
    const config = repoConfigSchema.parse({
      workspaceId: "fairnest",
      workspaceName: "Fairnest",
      repoPath: database.repoPath,
      defaultRuntimeKind: "opencode",
      branchPrefix: "odt",
      worktreeCopyPaths: [".env"],
      hooks: { preStart: ["setup --local"], postComplete: [] },
    });
    const roles = [{ id: "role-1", name: "Reviewer", systemPrompt: "Original prompt." }];
    const state = {
      failStart: false,
      failSave: false,
      failStop: false,
      failHook: false,
      failCleanup: false,
      partialCreate: false,
      changed: false,
      collision: false,
      validGit: true,
      // SAFETY: The initial literal belongs to the union of states used by this test fake.
      observation: "missing" as "missing" | "running" | "error",
      worktree: "",
      branch: "",
    };
    const store = createSqliteWorkspaceSessionStore(database.contextProvider);
    const failure = (message: string) =>
      Effect.fail(new HostOperationError({ operation: "test", message }));
    const dependencies: WorkspaceSessionServiceDependencies = {
      store: {
        ...store,
        create: (request) => {
          calls.push("save");
          return state.failSave ? failure("database write failed") : store.create(request);
        },
      },
      settings: {
        getRepoConfig: () => Effect.succeed(config),
        listCustomAgentRoles: () => Effect.succeed(roles),
      },
      git: createGitPortTestDouble({
        canonicalizePath: (value) => Effect.succeed(value),
        isGitRepository: () => Effect.succeed(state.validGit),
        getStatus: () =>
          Effect.succeed(
            state.changed ? [{ path: "changed.ts", status: "modified", staged: false }] : [],
          ),
        referenceExists: (_repo, reference) =>
          Effect.succeed(state.collision || branches.has(reference)),
        shareGitCommonDirectory: () => Effect.succeed(true),
        isRegisteredWorktree: (_repo, directory) => Effect.succeed(registered.has(directory)),
        createWorktree: (_repo, directory, branch, createBranch, startPoint) =>
          Effect.suspend(() => {
            calls.push("worktree");
            expect(createBranch).toBe(true);
            expect(startPoint).toBe("HEAD");
            state.worktree = directory;
            state.branch = branch;
            branches.add(`refs/heads/${branch}`);
            paths.add(directory);
            registered.add(directory);
            return state.partialCreate ? failure("git add failed after creation") : Effect.void;
          }),
        removeWorktree: (_repo, directory) =>
          Effect.suspend(() => {
            calls.push("remove-worktree");
            if (state.failCleanup) return failure("worktree removal failed");
            paths.delete(directory);
            registered.delete(directory);
            return Effect.void;
          }),
        deleteLocalBranch: (_repo, branch) =>
          Effect.sync(() => {
            calls.push("delete-branch");
            branches.delete(`refs/heads/${branch}`);
          }),
      }),
      settingsConfig: createSettingsConfigTestDouble({
        defaultWorktreeBasePath: () => "/worktrees",
        resolveConfiguredPath: (value) => value,
        join: path.join,
        pathExists: (value) => Effect.succeed(paths.has(value)),
      }),
      worktreeFiles: createWorktreeFilePortTestDouble({
        ensureDirectory: () => Effect.void,
        copyConfiguredPaths: (_repo, _directory, copyPaths) =>
          Effect.sync(() => {
            expect(copyPaths).toEqual([".env"]);
            calls.push("copy");
          }),
        pathIsWithinRoot: () => Effect.succeed(true),
        removePathIfPresent: (value) =>
          Effect.sync(() => {
            paths.delete(value);
          }),
      }),
      systemCommands: {
        resolveCommandPath: () => Effect.dieMessage("Unexpected command lookup"),
        versionCommand: () => Effect.dieMessage("Unexpected version command"),
        runCommandAllowFailure: (command, args, options) =>
          Effect.sync(() => {
            calls.push("hook");
            expect(command).toBe("setup");
            expect(args).toEqual(["--local"]);
            expect(options?.cwd).toBe(state.worktree);
            return { ok: !state.failHook, stdout: "", stderr: state.failHook ? "hook failed" : "" };
          }),
      },
      runtime: {
        runtimeEnsure: ({ repoPath }) =>
          Effect.sync(() => {
            calls.push("ensure-runtime");
            return {
              kind: "opencode",
              runtimeId: "runtime",
              repoPath,
              taskId: null,
              role: "workspace",
              workingDirectory: repoPath,
              runtimeRoute: { type: "local_http", endpoint: "http://localhost:1234" },
              startedAt: "2026-09-07T00:00:00Z",
              descriptor: OPENCODE_RUNTIME_DESCRIPTOR,
            };
          }),
      },
      live: {
        startSession: (request) =>
          Effect.suspend(() => {
            calls.push("start");
            starts.push(request);
            if (state.failStart) return failure("runtime start failed");
            return Effect.succeed({
              externalSessionId: `native-${starts.length}`,
              runtimeKind: request.runtimeKind,
              workingDirectory: request.workingDirectory,
              startedAt: "2026-09-07T00:00:00Z",
              status: "idle",
            });
          }),
        releaseSession: () =>
          Effect.sync(() => {
            calls.push("release");
          }),
        stopSession: () =>
          Effect.suspend(() => {
            calls.push("stop");
            return state.failStop ? failure("stop failed") : Effect.void;
          }),
        read: (ref) =>
          Effect.suspend(() => {
            if (state.observation === "error") return failure("observation failed");
            const observed: AgentSessionLiveReadResult =
              state.observation === "missing"
                ? { type: "missing", ref }
                : {
                    type: "live",
                    session: {
                      ref,
                      repositoryScope: { kind: "repository" },
                      activity: "running",
                      title: "Runtime title",
                      startedAt: "2026-09-07T00:00:00Z",
                      pendingApprovals: [],
                      pendingQuestions: [],
                      contextUsage: null,
                    },
                  };
            return Effect.succeed(observed);
          }),
      },
    };
    return {
      service: createWorkspaceSessionService(dependencies),
      dependencies,
      calls,
      starts,
      state,
      roles,
      paths,
      branches,
      registered,
    };
  };

  test("creation completes through the real runtime registry cancellation race", async () => {
    const h = setup();
    const runtime = await Effect.runPromise(
      h.dependencies.runtime.runtimeEnsure({
        repoPath: database.repoPath,
        runtimeKind: "opencode",
      }),
    );
    const registry = createRuntimeRegistry({ runtimes: [runtime] });
    const service = createWorkspaceSessionService({
      ...h.dependencies,
      runtime: { runtimeEnsure: registry.ensureWorkspaceRuntime },
    });
    const fiber = Effect.runFork(service.create(input()));
    try {
      const completed = await Effect.runPromise(
        Fiber.await(fiber).pipe(Effect.timeoutOption("200 millis")),
      );
      expect(Option.isSome(completed)).toBe(true);
      const created = await Effect.runPromise(Fiber.join(fiber));
      expect(await Effect.runPromise(service.listActive("fairnest"))).toEqual([created.session]);
    } finally {
      // Release the registry's cancellation branch even when the regression deadlocks creation.
      await Effect.runPromise(registry.stopAllRuntimes());
      await Effect.runPromise(Fiber.await(fiber));
    }
  });

  test("creates one durable repository session with an immutable Role snapshot and accepted model", async () => {
    const h = setup();
    const created = await Effect.runPromise(h.service.create(input()));
    expect(h.calls).toEqual(["ensure-runtime", "start", "save"]);
    expect(h.starts[0]).toMatchObject({
      repoPath: database.repoPath,
      workingDirectory: database.repoPath,
      sessionScope: { kind: "repository" },
      systemPrompt: "Original prompt.",
      model: input().selectedModel,
    });
    h.roles[0]!.systemPrompt = "Edited prompt.";
    expect(created.session).toMatchObject({
      manualTitle: "My session",
      generatedTitle: null,
      archivedAt: null,
      roleSnapshot: { name: "Reviewer", systemPrompt: "Original prompt." },
      selectedModel: input().selectedModel,
    });
    expect(await Effect.runPromise(h.service.listActive("fairnest"))).toEqual([created.session]);
  });

  test("No Role supplies no Role prompt and missing Roles fail before resource creation", async () => {
    const h = setup();
    await expect(
      Effect.runPromise(h.service.create({ ...input(), customAgentRoleId: "deleted" })),
    ).rejects.toThrow("no longer exists");
    expect(h.calls).toEqual([]);
    const created = await Effect.runPromise(
      h.service.create({ ...input(), customAgentRoleId: null, manualTitle: null }),
    );
    expect(created.session.roleSnapshot).toBeNull();
    expect(h.starts[0]?.systemPrompt).toBe("");
  });

  test("worktree creation uses committed HEAD and Workspace setup before runtime startup", async () => {
    const h = setup();
    h.state.changed = true;
    await expect(
      Effect.runPromise(h.service.create({ ...input(), location: "local_worktree" })),
    ).rejects.toThrow("Uncommitted checkout changes");
    expect(h.calls).toEqual([]);
    const { session } = await Effect.runPromise(
      h.service.create({ ...input(), location: "local_worktree", confirmUncommittedChanges: true }),
    );
    expect(h.calls).toEqual(["worktree", "copy", "hook", "ensure-runtime", "start", "save"]);
    expect(h.state.worktree).toBe(`/worktrees/workspace-sessions/${session.id}`);
    expect(h.state.branch).toBe(`odt/session-${session.id.slice(0, 8)}`);
    expect(h.paths.has(h.state.worktree)).toBe(true);
  });

  test("rejects collisions and invalid titles before Git or runtime creation", async () => {
    const h = setup();
    h.state.collision = true;
    await expect(
      Effect.runPromise(h.service.create({ ...input(), location: "local_worktree" })),
    ).rejects.toThrow("already exists");
    await expect(
      Effect.runPromise(h.service.create({ ...input(), manualTitle: "x".repeat(121) })),
    ).rejects.toThrow("120 characters");
    expect(h.calls).toEqual([]);
  });

  test.each(["partialCreate", "failHook", "failStart", "failSave"] as const)(
    "rolls back all created Git resources after %s",
    async (failure) => {
      const h = setup();
      h.state[failure] = true;
      await expect(
        Effect.runPromise(h.service.create({ ...input(), location: "local_worktree" })),
      ).rejects.toThrow();
      expect(h.paths.size).toBe(0);
      expect(h.branches.size).toBe(0);
      expect(h.registered.size).toBe(0);
      expect(h.calls.slice(-2)).toEqual(["remove-worktree", "delete-branch"]);
      expect(h.calls.includes("release")).toBe(failure === "failSave");
      expect(await Effect.runPromise(h.service.listActive("fairnest"))).toEqual([]);
    },
  );

  test("reports original failure and cleanup failure together", async () => {
    const h = setup();
    h.state.failStart = true;
    h.state.failCleanup = true;
    await expect(
      Effect.runPromise(h.service.create({ ...input(), location: "local_worktree" })),
    ).rejects.toThrow(/runtime start failed[\s\S]*worktree removal failed/);
  });

  test("requires confirmation to stop before archive and retains state after Stop or observation failure", async () => {
    const h = setup();
    const { session } = await Effect.runPromise(h.service.create(input()));
    const ref = { workspaceId: "fairnest", sessionId: session.id };
    h.state.observation = "running";
    await expect(
      Effect.runPromise(h.service.archive({ ...ref, confirmStop: false })),
    ).rejects.toThrow("Confirm Stop");
    h.state.failStop = true;
    await expect(
      Effect.runPromise(h.service.archive({ ...ref, confirmStop: true })),
    ).rejects.toThrow("stop failed");
    h.state.observation = "error";
    await expect(
      Effect.runPromise(h.service.archive({ ...ref, confirmStop: true })),
    ).rejects.toThrow("observation failed");
    expect((await Effect.runPromise(h.service.get(ref))).archivedAt).toBeNull();
    h.state.observation = "running";
    h.state.failStop = false;
    const archived = await Effect.runPromise(h.service.archive({ ...ref, confirmStop: true }));
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.updatedAt).toBe(session.updatedAt);
    await expect(
      Effect.runPromise(h.service.rename({ ...ref, manualTitle: "Other" })),
    ).rejects.toThrow("Restore");
    const restored = await Effect.runPromise(h.service.restore(ref));
    expect(restored).toEqual(session);
    expect(h.starts).toHaveLength(1);
  });

  test.each(["missing directory", "unregistered worktree"] as const)(
    "archive rejects %s before Stop or durable mutation",
    async (invalidTarget) => {
      const h = setup();
      const { session } = await Effect.runPromise(
        h.service.create({ ...input(), location: "local_worktree" }),
      );
      const ref = { workspaceId: "fairnest", sessionId: session.id };
      if (invalidTarget === "missing directory") h.state.validGit = false;
      else h.registered.clear();
      h.state.observation = "running";
      await expect(
        Effect.runPromise(h.service.archive({ ...ref, confirmStop: true })),
      ).rejects.toThrow(/saved canonical Git directory|not a registered worktree/);
      expect(h.calls).not.toContain("stop");
      expect(await Effect.runPromise(h.service.get(ref))).toEqual(session);
    },
  );

  test("restore rejects an invalid directory without changing archive state", async () => {
    const h = setup();
    const { session } = await Effect.runPromise(h.service.create(input()));
    const ref = { workspaceId: "fairnest", sessionId: session.id };
    const archived = await Effect.runPromise(h.service.archive({ ...ref, confirmStop: false }));
    h.state.validGit = false;
    await expect(Effect.runPromise(h.service.restore(ref))).rejects.toThrow(
      "saved canonical Git directory",
    );
    expect(await Effect.runPromise(h.service.get(ref))).toEqual(archived);
  });
});
