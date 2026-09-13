import { describe, expect, test } from "bun:test";
import { Cause, Deferred, Effect, Exit, Fiber, Option, TestClock, TestContext } from "effect";
import { createWorkspaceSessionOperationGate } from "./workspace-session-operation-gate";

const ref = { workspaceId: "workspace", sessionId: "session" };

describe("Workspace Session operation gate", () => {
  test.each([
    { workspaceId: "workspace", sessionId: "another-session" },
    { workspaceId: "another-workspace", sessionId: "session" },
  ])("does not block a distinct session $workspaceId/$sessionId", async (other) => {
    const gate = createWorkspaceSessionOperationGate();
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const entered = yield* Deferred.make<void>();
          const held = yield* Effect.forkScoped(
            gate.run(ref, Deferred.succeed(entered, undefined).pipe(Effect.zipRight(Effect.never))),
          );
          yield* Deferred.await(entered);
          const independent = yield* Effect.forkScoped(gate.run(other, Effect.succeed("done")));
          yield* TestClock.adjust(0);
          expect(yield* Fiber.poll(independent)).toEqual(Option.some(Exit.succeed("done")));
          expect(Option.isNone(yield* Fiber.poll(held))).toBe(true);
        }),
      ).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  test("keeps one lock through waiter cancellation, handoff, and reuse", async () => {
    const gate = createWorkspaceSessionOperationGate();
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const firstEntered = yield* Deferred.make<void>();
          const firstRelease = yield* Deferred.make<void>();
          const secondEntered = yield* Deferred.make<void>();
          const secondRelease = yield* Deferred.make<void>();
          const first = yield* Effect.forkScoped(
            gate.run(
              ref,
              Deferred.succeed(firstEntered, undefined).pipe(
                Effect.zipRight(Deferred.await(firstRelease)),
              ),
            ),
          );
          yield* Deferred.await(firstEntered);
          const second = yield* Effect.forkScoped(
            gate.run(
              ref,
              Deferred.succeed(secondEntered, undefined).pipe(
                Effect.zipRight(Deferred.await(secondRelease)),
              ),
            ),
          );
          const canceled = yield* Effect.forkScoped(gate.run(ref, Effect.succeed("canceled")));
          yield* TestClock.adjust(0);
          expect(Option.isNone(yield* Fiber.poll(second))).toBe(true);
          expect(Option.isNone(yield* Fiber.poll(canceled))).toBe(true);
          const canceledExit = yield* Fiber.interrupt(canceled);
          expect(Exit.isFailure(canceledExit) && Cause.isInterrupted(canceledExit.cause)).toBe(
            true,
          );
          yield* Deferred.succeed(firstRelease, undefined);
          yield* Deferred.await(secondEntered);
          yield* Fiber.join(first);
          const third = yield* Effect.forkScoped(gate.run(ref, Effect.succeed("third")));
          yield* TestClock.adjust(0);
          expect(Option.isNone(yield* Fiber.poll(third))).toBe(true);
          yield* Deferred.succeed(secondRelease, undefined);
          yield* Fiber.join(second);
          expect(yield* Fiber.join(third)).toBe("third");
          expect(yield* gate.run(ref, Effect.succeed("reused"))).toBe("reused");
        }),
      ).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  test.each(["failure", "defect", "interruption"] as const)(
    "releases the active permit after %s",
    async (ending) => {
      const gate = createWorkspaceSessionOperationGate();
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const entered = yield* Deferred.make<void>();
            const release = yield* Deferred.make<void>();
            const operation = ending === "defect" ? Effect.die("broken") : Effect.fail("failed");
            const active = yield* Effect.forkScoped(
              gate.run(
                ref,
                Deferred.succeed(entered, undefined).pipe(
                  Effect.zipRight(Deferred.await(release)),
                  Effect.zipRight(operation),
                ),
              ),
            );
            yield* Deferred.await(entered);
            const next = yield* Effect.forkScoped(gate.run(ref, Effect.succeed("next")));
            yield* TestClock.adjust(0);
            expect(Option.isNone(yield* Fiber.poll(next))).toBe(true);
            const ended =
              ending === "interruption"
                ? yield* Fiber.interrupt(active)
                : yield* Deferred.succeed(release, undefined).pipe(
                    Effect.zipRight(Fiber.await(active)),
                  );
            expect(Exit.isFailure(ended)).toBe(true);
            if (Exit.isFailure(ended)) {
              if (ending === "interruption") expect(Cause.isInterrupted(ended.cause)).toBe(true);
              if (ending === "failure")
                expect(Cause.failureOption(ended.cause)).toEqual(Option.some("failed"));
              if (ending === "defect")
                expect(Cause.dieOption(ended.cause)).toEqual(Option.some("broken"));
            }
            expect(yield* Fiber.join(next)).toBe("next");
            expect(yield* gate.run(ref, Effect.succeed("reused"))).toBe("reused");
          }),
        ).pipe(Effect.provide(TestContext.TestContext)),
      );
    },
  );
});
