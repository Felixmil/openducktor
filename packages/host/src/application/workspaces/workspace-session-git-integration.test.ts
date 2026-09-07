import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  OPENCODE_RUNTIME_DESCRIPTOR,
  repoConfigSchema,
  type AgentSessionControlStartInput,
  type WorkspaceSession,
} from "@openducktor/contracts";
import { Effect } from "effect";
import { createWorktreeFileAdapter } from "../../adapters/filesystem/worktree-file-adapter";
import { createGitCliAdapter } from "../../adapters/git/git-cli-adapter";
import { createSettingsConfigAdapter } from "../../adapters/settings/settings-config-adapter";
import {
  createSqliteTaskStoreHarness,
  type SqliteTaskStoreTestHarness,
} from "../../adapters/sqlite/sqlite-task-store-test-support";
import { createSqliteWorkspaceSessionStore } from "../../adapters/sqlite/sqlite-workspace-session-store";
import { createSystemCommandRunner } from "../../adapters/system/system-command-runner";
import { HostOperationError } from "../../effect/host-errors";
import { createWorkspaceSessionCommandHandlers } from "../../interface/commands/workspace-session-command-handlers";
import {
  createEffectHostCommandRouter,
  toPromiseHostCommandRouter,
} from "../../interface/router/host-command-router";
import { createWorkspaceSessionService } from "./workspace-session-service";
import { withWorkspaceSessionTarget } from "./workspace-session-target";

describe("Workspace Session commands with real Git and SQLite", () => {
  let root: string;
  let repoPath: string;
  let database: SqliteTaskStoreTestHarness;
  const gitCommand = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), "odt-workspace-session-git-")));
    repoPath = path.join(root, "repository");
    await mkdir(repoPath);
    gitCommand("init", "-b", "main");
    await writeFile(path.join(repoPath, "tracked.txt"), "committed\n");
    await writeFile(path.join(repoPath, ".gitignore"), ".env\nhook-proof.txt\n");
    gitCommand("add", ".");
    gitCommand(
      "-c",
      "user.name=Workspace Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "Initial fixture",
    );
    database = await createSqliteTaskStoreHarness({ repoPath });
  });
  afterEach(async () => {
    await database.cleanup();
    await rm(root, { recursive: true, force: true });
  });

  const setup = (failStart = false) => {
    const starts: AgentSessionControlStartInput[] = [];
    const events: WorkspaceSession[] = [];
    const config = repoConfigSchema.parse({
      workspaceId: "fairnest",
      workspaceName: "Test",
      repoPath,
      defaultRuntimeKind: "opencode",
      branchPrefix: "odt",
      worktreeBasePath: path.join(root, "worktrees"),
      worktreeCopyPaths: [".env"],
      hooks: {
        preStart: [
          `${JSON.stringify(process.execPath)} -e ${JSON.stringify("require('node:fs').writeFileSync('hook-proof.txt', process.cwd())")}`,
        ],
        postComplete: [],
      },
    });
    const targetDependencies = {
      git: createGitCliAdapter({ resolveCommand: () => Effect.succeed("git") }),
      settingsConfig: createSettingsConfigAdapter({ configPath: path.join(root, "settings.json") }),
      worktreeFiles: createWorktreeFileAdapter(),
      systemCommands: createSystemCommandRunner(),
    };
    const store = createSqliteWorkspaceSessionStore(database.contextProvider);
    const service = createWorkspaceSessionService({
      ...targetDependencies,
      store,
      settings: {
        getRepoConfig: () => Effect.succeed(config),
        listCustomAgentRoles: () => Effect.succeed([]),
      },
      runtime: {
        runtimeEnsure: () =>
          Effect.succeed({
            kind: "opencode",
            runtimeId: "test-runtime",
            repoPath,
            taskId: null,
            role: "workspace",
            workingDirectory: repoPath,
            runtimeRoute: { type: "local_http", endpoint: "http://localhost:1234" },
            startedAt: "2026-09-07T00:00:00Z",
            descriptor: OPENCODE_RUNTIME_DESCRIPTOR,
          }),
      },
      live: {
        startSession: (input) =>
          Effect.suspend(() => {
            starts.push(input);
            if (failStart)
              return Effect.fail(
                new HostOperationError({
                  operation: "test.start",
                  message: "Runtime refused startup",
                }),
              );
            return Effect.succeed({
              externalSessionId: "native-1",
              runtimeKind: input.runtimeKind,
              workingDirectory: input.workingDirectory,
              startedAt: "2026-09-07T00:00:00Z",
              status: "idle",
            });
          }),
        releaseSession: () => Effect.void,
        stopSession: () => Effect.dieMessage("Idle sessions must not be stopped"),
        read: (ref) => Effect.succeed({ type: "missing", ref }),
      },
    });
    const router = toPromiseHostCommandRouter(
      createEffectHostCommandRouter({
        handlers: createWorkspaceSessionCommandHandlers(service, (_workspaceId, session) =>
          Effect.sync(() => {
            events.push(session);
          }),
        ),
      }),
    );
    const createInput = {
      workspaceId: "fairnest",
      runtimeKind: "opencode",
      selectedModel: null,
      customAgentRoleId: null,
      location: "local_worktree",
      manualTitle: null,
      confirmUncommittedChanges: false,
    };
    return { router, createInput, starts, events, targetDependencies, config };
  };

  test("creates from committed HEAD, copies setup files, runs hooks, and retains Git resources after archive", async () => {
    await writeFile(path.join(repoPath, ".env"), "TEST_VALUE=local\n");
    await writeFile(path.join(repoPath, "tracked.txt"), "uncommitted\n");
    const h = setup();
    await expect(h.router.invoke("workspace_session_create", h.createInput)).rejects.toThrow(
      "Uncommitted checkout changes",
    );
    expect(h.starts).toHaveLength(0);
    const result = await h.router.invoke("workspace_session_create", {
      ...h.createInput,
      confirmUncommittedChanges: true,
    });
    const directory = result.session.executionTarget.workingDirectory;
    expect(await readFile(path.join(directory, "tracked.txt"), "utf8")).toBe("committed\n");
    expect(await readFile(path.join(repoPath, "tracked.txt"), "utf8")).toBe("uncommitted\n");
    expect(await readFile(path.join(directory, ".env"), "utf8")).toBe("TEST_VALUE=local\n");
    expect(await readFile(path.join(directory, "hook-proof.txt"), "utf8")).toBe(directory);
    expect(gitCommand("-C", directory, "rev-parse", "HEAD")).toBe(gitCommand("rev-parse", "HEAD"));
    expect(directory).toBe(await realpath(directory));
    expect(h.starts[0]?.workingDirectory).toBe(directory);
    const ref = { workspaceId: "fairnest", sessionId: result.session.id };
    const archived = await h.router.invoke("workspace_session_archive", {
      ...ref,
      confirmStop: false,
    });
    expect(archived.archivedAt).not.toBeNull();
    expect(gitCommand("worktree", "list", "--porcelain")).toContain(directory);
    expect(
      await h.router.invoke("workspace_session_list_active", { workspaceId: "fairnest" }),
    ).toEqual([]);
    expect(await h.router.invoke("workspace_session_restore", ref)).toEqual(result.session);
    expect(h.events).toHaveLength(3);
    expect(h.starts).toHaveLength(1);
    gitCommand("worktree", "remove", "--force", directory);
    await expect(
      h.router.invoke("workspace_session_archive", { ...ref, confirmStop: false }),
    ).rejects.toThrow();
    expect(await h.router.invoke("workspace_session_get", ref)).toEqual(result.session);
    expect(h.events).toHaveLength(3);
  });

  test("rolls back the real worktree and branch when runtime startup fails", async () => {
    await writeFile(path.join(repoPath, ".env"), "TEST_VALUE=local\n");
    const h = setup(true);
    await expect(h.router.invoke("workspace_session_create", h.createInput)).rejects.toThrow(
      "Runtime refused startup",
    );
    expect(h.starts).toHaveLength(1);
    expect(gitCommand("worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
    expect(gitCommand("branch", "--list", "odt/session-*")).toBe("");
    expect(await readdir(path.join(root, "worktrees", "workspace-sessions"))).toEqual([]);
    expect(
      await h.router.invoke("workspace_session_list_active", { workspaceId: "fairnest" }),
    ).toEqual([]);
    expect(h.events).toEqual([]);
  });

  test.each(["path", "branch"] as const)(
    "rejects an existing %s without removing it",
    async (collision) => {
      const h = setup();
      const sessionId = "collision-session";
      const directory = path.join(root, "worktrees", "workspace-sessions", sessionId);
      const branch = "odt/session-collisio";
      if (collision === "path") {
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, "owned.txt"), "existing");
      } else gitCommand("branch", branch);
      await expect(
        Effect.runPromise(
          withWorkspaceSessionTarget(
            h.targetDependencies,
            {
              sessionId,
              repoConfig: h.config,
              location: "local_worktree",
              confirmUncommittedChanges: false,
            },
            () => Effect.dieMessage("Collision must fail before use"),
          ),
        ),
      ).rejects.toThrow("already exists");
      if (collision === "path")
        expect(await readFile(path.join(directory, "owned.txt"), "utf8")).toBe("existing");
      else expect(gitCommand("branch", "--list", branch)).toContain(branch);
    },
  );
});
