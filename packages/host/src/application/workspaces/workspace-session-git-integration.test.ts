import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  OPENCODE_RUNTIME_DESCRIPTOR,
  repoConfigSchema,
  type AgentSessionControlStartInput,
  type WorkspaceSession,
} from "@openducktor/contracts";
import { Cause, Deferred, Effect, Exit } from "effect";
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
import { createWorkspaceSessionOperationGate } from "./workspace-session-operation-gate";
import { withWorkspaceSessionTarget } from "./workspace-session-target";
import { hostInvokeFailureFromError } from "../../interface/router/host-invoke-failure";

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
  const registeredWorktreePaths = () =>
    gitCommand("worktree", "list", "--porcelain", "-z")
      .split("\0")
      .filter((field) => field.startsWith("worktree "))
      .map((field) => path.resolve(field.slice("worktree ".length)));
  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), "odt-workspace-session-git-")));
    repoPath = path.join(root, "repository");
    await mkdir(repoPath);
    gitCommand("init", "-b", "main");
    gitCommand("config", "core.autocrlf", "false");
    gitCommand("config", "core.eol", "lf");
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
      defaultTargetBranch: { remote: null, branch: "main" },
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
      operationGate: createWorkspaceSessionOperationGate(),
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
      selectedModel: { runtimeKind: "opencode", providerId: "provider", modelId: "model" },
      customAgentRoleId: null,
      location: "local_worktree",
      worktree: { mode: "from_name", name: "named-chat", branchName: null },
      manualTitle: null,
    };
    return { router, createInput, starts, events, targetDependencies, config };
  };

  test.each(["from_name", "from_branch"])(
    "creates %s without dirty-checkout confirmation, runs setup, and retains Git resources after archive",
    async (mode) => {
      await writeFile(path.join(repoPath, ".env"), "TEST_VALUE=local\n");
      await writeFile(path.join(repoPath, "tracked.txt"), "uncommitted\n");
      await writeFile(path.join(repoPath, "staged.txt"), "staged\n");
      gitCommand("add", "staged.txt");
      await writeFile(path.join(repoPath, "untracked.txt"), "untracked\n");
      const sourceStatus = gitCommand("status", "--porcelain");
      const h = setup();
      if (mode === "from_branch") gitCommand("branch", "odt/named-chat");
      const result = await h.router.invoke("workspace_session_create", {
        ...h.createInput,
        worktree: { ...h.createInput.worktree, mode, branchName: "odt/named-chat" },
      });
      const directory = result.session.executionTarget.workingDirectory;
      expect(await readFile(path.join(directory, "tracked.txt"), "utf8")).toBe("committed\n");
      expect(await readFile(path.join(repoPath, "tracked.txt"), "utf8")).toBe("uncommitted\n");
      expect(gitCommand("status", "--porcelain")).toBe(sourceStatus);
      for (const file of ["staged.txt", "untracked.txt"]) {
        await expect(readFile(path.join(directory, file), "utf8")).rejects.toThrow("ENOENT");
      }
      expect(await readFile(path.join(directory, ".env"), "utf8")).toBe("TEST_VALUE=local\n");
      expect(await readFile(path.join(directory, "hook-proof.txt"), "utf8")).toBe(directory);
      expect(gitCommand("-C", directory, "rev-parse", "HEAD")).toBe(
        gitCommand("rev-parse", "HEAD"),
      );
      expect(directory).toBe(await realpath(directory));
      expect(directory).toBe(path.join(root, "worktrees", "workspace-sessions", "named-chat"));
      expect(gitCommand("-C", directory, "branch", "--show-current")).toBe("odt/named-chat");
      expect(h.starts).toHaveLength(0);
      const ref = { workspaceId: "fairnest", sessionId: result.session.id };
      const started = await h.router.invoke("workspace_session_start", ref);
      expect(h.starts[0]?.workingDirectory).toBe(directory);
      const archived = await h.router.invoke("workspace_session_archive", {
        ...ref,
        confirmStop: false,
      });
      expect(archived.archivedAt).not.toBeNull();
      expect(registeredWorktreePaths()).toContain(directory);
      expect(
        await h.router.invoke("workspace_session_list_active", { workspaceId: "fairnest" }),
      ).toEqual([]);
      expect(await h.router.invoke("workspace_session_restore", ref)).toEqual(started.session);
      expect(h.events).toHaveLength(4);
      expect(h.starts).toHaveLength(1);
      gitCommand("worktree", "remove", "--force", directory);
      await expect(
        h.router.invoke("workspace_session_archive", { ...ref, confirmStop: false }),
      ).rejects.toThrow();
      expect(await h.router.invoke("workspace_session_get", ref)).toEqual(started.session);
      expect(h.events).toHaveLength(4);
    },
  );

  test.each(["create", "restore"] as const)(
    "a failed %s leaves a competing chat's real worktree and files intact",
    async (operation) => {
      await writeFile(path.join(repoPath, ".env"), "TEST_VALUE=local\n");
      const h = setup();
      const original = await h.router.invoke("workspace_session_create", h.createInput);
      const ref = { workspaceId: "fairnest", sessionId: original.session.id };
      const archived = await h.router.invoke("workspace_session_archive", {
        ...ref,
        removeWorktree: true,
      });
      const entered = Effect.runSync(Deferred.make<void>());
      const release = Effect.runSync(Deferred.make<void>());
      const createWorktree = h.targetDependencies.git.createWorktree;
      let first = true;
      h.targetDependencies.git.createWorktree = (...args) =>
        Effect.gen(function* () {
          if (first) {
            first = false;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
          }
          yield* createWorktree(...args);
        });
      const loser = Effect.runPromiseExit(
        Effect.tryPromise({
          try: () =>
            operation === "create"
              ? h.router.invoke("workspace_session_create", h.createInput).then(() => undefined)
              : h.router.invoke("workspace_session_restore", ref).then(() => undefined),
          catch: (cause) => cause,
        }),
      );
      try {
        await Effect.runPromise(Deferred.await(entered));
        const winner = await h.router.invoke("workspace_session_create", h.createInput);
        const directory = winner.session.executionTarget.workingDirectory;
        await writeFile(path.join(directory, "owned.txt"), "Keep the winning request's file.");
        await Effect.runPromise(Deferred.succeed(release, undefined));
        const failed = await loser;
        expect(Exit.isFailure(failed)).toBe(true);
        if (Exit.isFailure(failed))
          expect(Cause.pretty(failed.cause)).toContain("Git did not confirm worktree creation");
        expect(await readFile(path.join(directory, "owned.txt"), "utf8")).toBe(
          "Keep the winning request's file.",
        );
        expect(registeredWorktreePaths()).toContain(directory);
        expect(gitCommand("branch", "--list", "odt/named-chat")).toContain("odt/named-chat");
        expect(await h.router.invoke("workspace_session_get", ref)).toEqual(archived);
        expect(
          await h.router.invoke("workspace_session_list_active", { workspaceId: "fairnest" }),
        ).toEqual([winner.session]);
      } finally {
        await Effect.runPromise(Deferred.succeed(release, undefined));
        await loser;
      }
    },
  );

  test("retains the named draft worktree and branch when first-send runtime startup fails", async () => {
    await writeFile(path.join(repoPath, ".env"), "TEST_VALUE=local\n");
    const h = setup(true);
    const { session } = await h.router.invoke("workspace_session_create", h.createInput);
    await expect(
      h.router.invoke("workspace_session_start", {
        workspaceId: "fairnest",
        sessionId: session.id,
      }),
    ).rejects.toThrow("Runtime refused startup");
    expect(h.starts).toHaveLength(1);
    expect(registeredWorktreePaths()).toContain(session.executionTarget.workingDirectory);
    expect(gitCommand("branch", "--list", "odt/named-chat")).toContain("odt/named-chat");
    expect(
      await h.router.invoke("workspace_session_list_active", { workspaceId: "fairnest" }),
    ).toEqual([session]);
    expect(h.events).toEqual([session]);
  });

  test("removes its new worktree and branch when a setup hook fails", async () => {
    await writeFile(path.join(repoPath, ".env"), "TEST_VALUE=local\n");
    const h = setup();
    h.config.hooks.preStart = [
      `${JSON.stringify(process.execPath)} -e ${JSON.stringify("process.exit(1)")}`,
    ];
    await expect(h.router.invoke("workspace_session_create", h.createInput)).rejects.toThrow(
      "pre-start hook failed",
    );
    expect(gitCommand("worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
    expect(gitCommand("branch", "--list", "odt/named-chat")).toBe("");
    expect(
      await h.router.invoke("workspace_session_list_active", { workspaceId: "fairnest" }),
    ).toEqual([]);
  });

  test("checks out the selected existing branch and keeps its name and commit", async () => {
    await writeFile(path.join(repoPath, ".env"), "TEST_VALUE=local\n");
    gitCommand("checkout", "-b", "feature/existing");
    gitCommand(
      "-c",
      "user.name=Workspace Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-m",
      "Existing branch commit",
    );
    const existingHead = gitCommand("rev-parse", "HEAD");
    gitCommand("checkout", "main");
    const h = setup();
    const { session } = await h.router.invoke("workspace_session_create", {
      ...h.createInput,
      worktree: {
        mode: "from_branch",
        name: "feat/add-facebook-login",
        branchName: "feature/existing",
      },
    });
    const directory = session.executionTarget.workingDirectory;
    expect(directory).toBe(
      path.join(root, "worktrees", "workspace-sessions", "feat-add-facebook-login"),
    );
    expect(gitCommand("-C", directory, "branch", "--show-current")).toBe("feature/existing");
    expect(gitCommand("-C", directory, "rev-parse", "HEAD")).toBe(existingHead);
    expect(gitCommand("branch", "--list", "odt/*")).toBe("");
    expect(gitCommand("branch", "--show-current")).toBe("main");
  });

  test("uses an advanced branch name for a new worktree", async () => {
    await writeFile(path.join(repoPath, ".env"), "TEST_VALUE=local\n");
    const h = setup();
    const { session } = await h.router.invoke("workspace_session_create", {
      ...h.createInput,
      worktree: { mode: "from_name", name: "custom-review", branchName: "feature/custom" },
    });
    expect(
      gitCommand("-C", session.executionTarget.workingDirectory, "branch", "--show-current"),
    ).toBe("feature/custom");
    expect(session.executionTarget.workingDirectory).toBe(
      path.join(root, "worktrees", "workspace-sessions", "custom-review"),
    );
  });

  test("removes a failed worktree but never its reused branch", async () => {
    await writeFile(path.join(repoPath, ".env"), "TEST_VALUE=local\n");
    gitCommand("branch", "feature/existing");
    const originalHead = gitCommand("rev-parse", "refs/heads/feature/existing");
    const h = setup();
    await expect(
      Effect.runPromise(
        withWorkspaceSessionTarget(
          h.targetDependencies,
          {
            repoConfig: h.config,
            location: "local_worktree",
            worktree: {
              mode: "from_branch",
              name: "failed-review",
              branchName: "feature/existing",
            },
          },
          () =>
            Effect.fail(new HostOperationError({ operation: "test.save", message: "Save failed" })),
        ),
      ),
    ).rejects.toThrow("Save failed");
    expect(gitCommand("rev-parse", "refs/heads/feature/existing")).toBe(originalHead);
    expect(gitCommand("worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
  });

  test("rejects an already checked-out branch without deleting it or its checkout", async () => {
    const h = setup();
    const originalHead = gitCommand("rev-parse", "main");
    await expect(
      h.router.invoke("workspace_session_create", {
        ...h.createInput,
        worktree: { mode: "from_branch", name: "main-review", branchName: "main" },
      }),
    ).rejects.toThrow(
      `Branch main is already checked out at ${gitCommand("rev-parse", "--show-toplevel")}. Choose another branch or use Current checkout.`,
    );
    expect(gitCommand("rev-parse", "main")).toBe(originalHead);
    expect(gitCommand("branch", "--show-current")).toBe("main");
    expect(gitCommand("worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
    expect(
      await h.router.invoke("workspace_session_list_active", { workspaceId: "fairnest" }),
    ).toEqual([]);
  });

  test("reports a linked checkout on its branch field and leaves both worktrees untouched", async () => {
    const h = setup();
    const occupied = path.join(
      root,
      process.platform === "win32" ? "other checkout" : "other | checkout\nwith newline ",
    );
    const occupiedGitPath = occupied.split(path.sep).join("/");
    gitCommand("worktree", "add", "-b", "feature/occupied", occupied);
    await writeFile(path.join(occupied, "owned.txt"), "keep this");
    expect(await Effect.runPromise(h.targetDependencies.git.listBranches(repoPath))).toContainEqual(
      {
        name: "feature/occupied",
        isCurrent: false,
        isRemote: false,
        worktreePath: occupiedGitPath,
      },
    );
    const error = await h.router
      .invoke("workspace_session_create", {
        ...h.createInput,
        worktree: { mode: "from_branch", name: "different-name", branchName: "feature/occupied" },
      })
      .then(
        () => {
          throw new Error("Expected branch conflict");
        },
        (cause: unknown) => cause,
      );
    expect(hostInvokeFailureFromError(error)).toEqual({
      kind: "workspace_session_validation",
      field: "worktree.branchName",
    });
    expect(error).toMatchObject({
      message: `Branch feature/occupied is already checked out at ${occupiedGitPath}. Choose another branch or use Current checkout.`,
    });
    expect(await readFile(path.join(occupied, "owned.txt"), "utf8")).toBe("keep this");
    expect(gitCommand("branch", "--show-current")).toBe("main");
    expect(
      await h.router.invoke("workspace_session_list_active", { workspaceId: "fairnest" }),
    ).toEqual([]);
    expect(h.events).toEqual([]);
  });

  test.each(["directory", "registered worktree"])(
    "reports an existing %s on the name field without changing it",
    async (kind) => {
      const h = setup();
      const directory = path.join(root, "worktrees", "workspace-sessions", "named-chat");
      if (kind === "directory") await mkdir(directory, { recursive: true });
      else gitCommand("worktree", "add", "-b", "feature/owned", directory);
      await writeFile(path.join(directory, "owned.txt"), "keep this");
      const error = await h.router.invoke("workspace_session_create", h.createInput).then(
        () => {
          throw new Error("Expected directory conflict");
        },
        (cause: unknown) => cause,
      );
      expect(hostInvokeFailureFromError(error)).toEqual({
        kind: "workspace_session_validation",
        field: "worktree.name",
      });
      expect(error).toMatchObject({
        message: `Worktree directory already exists: ${directory}. Choose another name.`,
      });
      expect(await readFile(path.join(directory, "owned.txt"), "utf8")).toBe("keep this");
      expect(gitCommand("branch", "--list", "odt/named-chat")).toBe("");
      expect(
        await h.router.invoke("workspace_session_list_active", { workspaceId: "fairnest" }),
      ).toEqual([]);
      expect(h.events).toEqual([]);
    },
  );

  test.each(["from_name", "from_branch"] as const)(
    "archive removes %s worktrees and branches; restore uses the current default branch",
    async (mode) => {
      await writeFile(path.join(repoPath, ".env"), "TEST_VALUE=local\n");
      const h = setup();
      const branchName = "feature/archive-review";
      if (mode === "from_branch") gitCommand("branch", branchName);
      const { session } = await h.router.invoke("workspace_session_create", {
        ...h.createInput,
        worktree: { mode, name: "different-directory-name", branchName },
      });
      const ref = { workspaceId: "fairnest", sessionId: session.id };
      const started = await h.router.invoke("workspace_session_start", ref);
      const directory = session.executionTarget.workingDirectory;
      gitCommand(
        "-C",
        directory,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--allow-empty",
        "-m",
        "Branch-only commit",
      );
      const oldHead = gitCommand("-C", directory, "rev-parse", "HEAD");
      await writeFile(path.join(directory, "tracked.txt"), "discard this edit\n");
      await writeFile(path.join(directory, "untracked.txt"), "discard this file\n");
      expect(await h.router.invoke("workspace_session_archive_preview", ref)).toEqual({
        branchName,
        worktreeExists: true,
        hasUncommittedChanges: true,
      });
      const archived = await h.router.invoke("workspace_session_archive", {
        ...ref,
        confirmStop: true,
        removeWorktree: true,
      });
      expect(archived.executionTarget).toMatchObject({
        kind: "local_worktree",
        branchName,
        worktreeState: "removed",
      });
      expect(registeredWorktreePaths()).not.toContain(directory);
      expect(gitCommand("branch", "--list", branchName)).toBe("");
      await expect(readFile(path.join(directory, "tracked.txt"), "utf8")).rejects.toThrow();
      expect(
        await h.router.invoke("workspace_session_list_archived", { workspaceId: "fairnest" }),
      ).toEqual([archived]);

      await writeFile(path.join(repoPath, "tracked.txt"), "new default branch content\n");
      gitCommand("add", "tracked.txt");
      gitCommand(
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "Advance default branch",
      );
      const defaultHead = gitCommand("rev-parse", "main");
      gitCommand("checkout", "-b", "other-checkout");
      gitCommand(
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--allow-empty",
        "-m",
        "Different checkout HEAD",
      );
      const restored = await h.router.invoke("workspace_session_restore", ref);
      expect(restored).toEqual(started.session);
      expect(gitCommand("-C", directory, "branch", "--show-current")).toBe(branchName);
      expect(gitCommand("-C", directory, "rev-parse", "HEAD")).toBe(defaultHead);
      expect(defaultHead).not.toBe(oldHead);
      expect(defaultHead).not.toBe(gitCommand("rev-parse", "HEAD"));
      expect(await readFile(path.join(directory, "tracked.txt"), "utf8")).toBe(
        "new default branch content\n",
      );
      expect(await readFile(path.join(directory, ".env"), "utf8")).toBe("TEST_VALUE=local\n");
      expect(await readFile(path.join(directory, "hook-proof.txt"), "utf8")).toBe(directory);
      await expect(readFile(path.join(directory, "untracked.txt"), "utf8")).rejects.toThrow();
      expect(h.starts).toHaveLength(1);
    },
  );

  test.each(["directory", "branch", "default branch"] as const)(
    "restore refuses a conflicting or missing %s without changing the archive",
    async (conflict) => {
      await writeFile(path.join(repoPath, ".env"), "TEST_VALUE=local\n");
      const h = setup();
      const { session } = await h.router.invoke("workspace_session_create", h.createInput);
      const ref = { workspaceId: "fairnest", sessionId: session.id };
      const archived = await h.router.invoke("workspace_session_archive", {
        ...ref,
        removeWorktree: true,
      });
      const directory = session.executionTarget.workingDirectory;
      if (conflict === "directory") {
        await mkdir(directory);
        await writeFile(path.join(directory, "owned.txt"), "keep this");
      } else if (conflict === "branch") {
        gitCommand("branch", "odt/named-chat");
      } else {
        h.config.defaultTargetBranch = { branch: "missing-default" };
      }
      await expect(h.router.invoke("workspace_session_restore", ref)).rejects.toThrow();
      expect(await h.router.invoke("workspace_session_get", ref)).toEqual(archived);
      if (conflict === "directory")
        expect(await readFile(path.join(directory, "owned.txt"), "utf8")).toBe("keep this");
      if (conflict === "branch")
        expect(gitCommand("branch", "--list", "odt/named-chat")).toContain("odt/named-chat");
      expect(gitCommand("worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
    },
  );

  test("keeps a protected default-branch worktree when removal is refused", async () => {
    await writeFile(path.join(repoPath, ".env"), "TEST_VALUE=local\n");
    gitCommand("checkout", "-b", "other-checkout");
    const h = setup();
    const { session } = await h.router.invoke("workspace_session_create", {
      ...h.createInput,
      worktree: { mode: "from_branch", name: "main-review", branchName: "main" },
    });
    const ref = { workspaceId: "fairnest", sessionId: session.id };
    await expect(
      h.router.invoke("workspace_session_archive", { ...ref, removeWorktree: true }),
    ).rejects.toThrow("protected branch main");
    expect(registeredWorktreePaths()).toContain(session.executionTarget.workingDirectory);
    const archived = await h.router.invoke("workspace_session_archive", {
      ...ref,
      removeWorktree: false,
    });
    expect(archived.executionTarget).toEqual(session.executionTarget);
    gitCommand("worktree", "remove", "--force", session.executionTarget.workingDirectory);
    await expect(h.router.invoke("workspace_session_restore", ref)).rejects.toThrow();
    expect(await h.router.invoke("workspace_session_get", ref)).toEqual(archived);
  });

  test.each(["path", "branch"] as const)(
    "rejects an existing %s without removing it",
    async (collision) => {
      const h = setup();
      const name = "collision-chat";
      const directory = path.join(root, "worktrees", "workspace-sessions", name);
      const branch = "odt/collision-chat";
      if (collision === "path") {
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, "owned.txt"), "existing");
      } else gitCommand("branch", branch);
      await expect(
        Effect.runPromise(
          withWorkspaceSessionTarget(
            h.targetDependencies,
            {
              worktree: { mode: "from_name", name, branchName: null },
              repoConfig: h.config,
              location: "local_worktree",
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
