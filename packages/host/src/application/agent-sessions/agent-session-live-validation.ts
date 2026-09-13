import { Effect } from "effect";
import type { z } from "zod";
import { HostValidationError } from "../../effect/host-errors";

export const parseAdapterOutput = <Schema extends z.ZodType, Input>(
  schema: Schema,
  value: Input,
  operation: string,
): Effect.Effect<z.output<Schema>, HostValidationError<{ operation: string }>> =>
  Effect.try({
    try: () => schema.parse(value),
    catch: (cause) =>
      new HostValidationError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
        details: { operation },
      }),
  });
