import type { z } from "zod";
import { Errors } from "@rootmail/core";

/**
 * Parse `data` against a Zod schema, throwing a 422 AppError on failure.
 * Returns the schema's *output* type (so `.default()` / `.coerce` are respected).
 */
export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw Errors.validation("Request validation failed", result.error.flatten());
  }
  return result.data;
}
