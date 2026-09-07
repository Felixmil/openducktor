import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { WorkspaceSession } from "@openducktor/contracts";
import { Effect } from "effect";
import { createSqliteTaskRepositoryContextManager } from "./sqlite-task-repository-context";
import {
  createSqliteTaskStoreHarness,
  type SqliteTaskStoreTestHarness,
} from "./sqlite-task-store-test-support";
import { createSqliteWorkspaceSessionStore } from "./sqlite-workspace-session-store";

const makeSession = (id = "one", updatedAt = 1): WorkspaceSession => ({
  id,
  runtimeKind: "codex",
  externalSessionId: `runtime-${id}`,
  executionTarget: { kind: "local_worktree", workingDirectory: `/repo/${id}` },
  roleSnapshot: { id: "reviewer", name: "Reviewer", systemPrompt: "Review this code." },
  selectedModel: { runtimeKind: "codex", providerId: "openai", modelId: "model", variant: "high" },
  generatedTitle: null,
  manualTitle: null,
  createdAt: 1,
  updatedAt,
  archivedAt: null,
});

describe("SQLite Workspace Session store", () => {
  let harness: SqliteTaskStoreTestHarness;
  beforeEach(async () => {
    harness = await createSqliteTaskStoreHarness();
  });
  afterEach(async () => {
    await harness.cleanup();
  });
  const scope = () => ({ repoPath: harness.repoPath, workspaceId: "fairnest" });
  const ref = (sessionId = "one") => ({ ...scope(), sessionId });
  const store = () => createSqliteWorkspaceSessionStore(harness.contextProvider);

  test("persists metadata and Role snapshots across connection restarts", async () => {
    const session = makeSession();
    await Effect.runPromise(store().create({ ...scope(), session }));
    const reopened = createSqliteTaskRepositoryContextManager({
      processEnv: {},
      resolveWorkspaceIdForRepoPath: () => Effect.succeed("fairnest"),
      resolveDatabasePath: () => Effect.succeed(harness.databasePath),
    });
    try {
      expect(
        await Effect.runPromise(
          createSqliteWorkspaceSessionStore(reopened.withDatabase).get(ref()),
        ),
      ).toEqual(session);
    } finally {
      await Effect.runPromise(reopened.dispose());
    }
  });

  test("rejects duplicate identities, missing records, and a mismatched Workspace", async () => {
    const repository = store();
    await Effect.runPromise(repository.create({ ...scope(), session: makeSession() }));
    await expect(
      Effect.runPromise(repository.create({ ...scope(), session: makeSession() })),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(
        repository.create({ ...scope(), session: { ...makeSession(), id: "two" } }),
      ),
    ).rejects.toThrow();
    await expect(Effect.runPromise(repository.get(ref("absent")))).rejects.toThrow(
      "does not exist",
    );
    await expect(
      Effect.runPromise(repository.listActive({ ...scope(), workspaceId: "other" })),
    ).rejects.toThrow("no longer matches");
    expect(
      await Effect.runPromise(
        repository.findByRuntimeSession({
          ...scope(),
          runtimeKind: "codex",
          externalSessionId: "absent",
        }),
      ),
    ).toBeNull();
    expect(
      (
        await Effect.runPromise(
          repository.findByRuntimeSession({
            ...scope(),
            runtimeKind: "codex",
            externalSessionId: "runtime-one",
          }),
        )
      )?.id,
    ).toBe("one");
  });

  test("archives and restores idempotently without changing activity or execution", async () => {
    const repository = store();
    const original = makeSession();
    await Effect.runPromise(repository.create({ ...scope(), session: original }));
    const archived = await Effect.runPromise(repository.archive({ ...ref(), archivedAt: 20 }));
    expect(archived).toEqual({ ...original, archivedAt: 20 });
    expect(await Effect.runPromise(repository.archive({ ...ref(), archivedAt: 30 }))).toEqual(
      archived,
    );
    expect(await Effect.runPromise(repository.listActive(scope()))).toEqual([]);
    expect(await Effect.runPromise(repository.listArchived(scope()))).toEqual([archived]);
    expect(await Effect.runPromise(repository.restore(ref()))).toEqual(original);
    expect(await Effect.runPromise(repository.restore(ref()))).toEqual(original);
    expect(
      (await Effect.runPromise(repository.archive({ ...ref(), archivedAt: 40 }))).archivedAt,
    ).toBe(40);
  });

  test("validates models and titles while keeping activity unchanged", async () => {
    const repository = store();
    await Effect.runPromise(repository.create({ ...scope(), session: makeSession() }));
    expect(
      (await Effect.runPromise(repository.rename({ ...ref(), manualTitle: "  My\n  session " })))
        .manualTitle,
    ).toBe("My session");
    expect(
      (await Effect.runPromise(repository.rename({ ...ref(), manualTitle: " " }))).manualTitle,
    ).toBeNull();
    await expect(
      Effect.runPromise(repository.rename({ ...ref(), manualTitle: "a".repeat(121) })),
    ).rejects.toThrow("Invalid Workspace Session");
    const generated = await Effect.runPromise(
      repository.setGeneratedTitle({ ...ref(), generatedTitle: "Generated title" }),
    );
    expect(generated.updatedAt).toBe(1);
    expect(
      (
        await Effect.runPromise(
          repository.setGeneratedTitle({ ...ref(), generatedTitle: "Replacement" }),
        )
      ).generatedTitle,
    ).toBe("Replacement");
    await expect(
      Effect.runPromise(repository.setGeneratedTitle({ ...ref(), generatedTitle: "" })),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(
        repository.setSelectedModel({
          ...ref(),
          selectedModel: { runtimeKind: "opencode", providerId: "openai", modelId: "model" },
        }),
      ),
    ).rejects.toThrow("Invalid Workspace Session");
    expect((await Effect.runPromise(repository.get(ref()))).selectedModel?.runtimeKind).toBe(
      "codex",
    );
  });

  test("records activity forward only and orders active sessions by activity", async () => {
    const repository = store();
    await Effect.runPromise(repository.create({ ...scope(), session: makeSession("one", 10) }));
    await Effect.runPromise(repository.create({ ...scope(), session: makeSession("two", 20) }));
    for (const occurredAt of [30, 30, 5]) {
      expect(
        (
          await Effect.runPromise(
            repository.recordActivity({ ...ref(), activity: { type: "user_message", occurredAt } }),
          )
        ).updatedAt,
      ).toBe(30);
    }
    expect(
      (await Effect.runPromise(repository.listActive(scope()))).map((session) => session.id),
    ).toEqual(["one", "two"]);
    expect(
      (
        await Effect.runPromise(
          repository.recordActivity({
            ...ref(),
            activity: { type: "assistant_response", occurredAt: 40 },
          }),
        )
      ).updatedAt,
    ).toBe(40);
  });

  test("limits archived sessions to the latest 100 without limiting active sessions", async () => {
    const repository = store();
    for (let index = 0; index < 102; index += 1) {
      await Effect.runPromise(
        repository.create({ ...scope(), session: makeSession(String(index), index) }),
      );
    }
    expect(await Effect.runPromise(repository.listActive(scope()))).toHaveLength(102);
    for (let index = 0; index < 102; index += 1) {
      await Effect.runPromise(repository.archive({ ...ref(String(index)), archivedAt: index }));
    }
    const archived = await Effect.runPromise(repository.listArchived(scope()));
    expect(archived).toHaveLength(100);
    expect(archived[0]?.id).toBe("101");
    expect(archived[99]?.id).toBe("2");
  });

  test("surfaces corrupt stored JSON instead of hiding the record", async () => {
    const repository = store();
    await Effect.runPromise(repository.create({ ...scope(), session: makeSession() }));
    const database = new Database(harness.databasePath);
    try {
      database.run("UPDATE workspace_sessions SET role_snapshot_json = 'broken' WHERE id = 'one'");
    } finally {
      database.close();
    }
    await expect(Effect.runPromise(repository.listActive(scope()))).rejects.toThrow(
      "Stored Workspace Session one is invalid",
    );
  });
});
