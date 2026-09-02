import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiErrorBody } from "@shared/types";

type ErrorCode = ApiErrorBody["error"]["code"];

export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: ErrorCode,
    message: string,
    public readonly issues?: unknown[],
  ) {
    super(message);
    this.name = "ApiError";
  }

  static notFound(what = "Resource") {
    return new ApiError(404, "not_found", `${what} not found`);
  }
  static badRequest(message: string) {
    return new ApiError(400, "bad_request", message);
  }
  static conflict(message: string) {
    return new ApiError(409, "conflict", message);
  }
  static tooLarge(message: string) {
    return new ApiError(413, "payload_too_large", message);
  }
  static unauthorized(message = "Sign in required") {
    return new ApiError(401, "unauthorized", message);
  }
  static forbidden(message = "Admin role required") {
    return new ApiError(403, "forbidden", message);
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, ...(this.issues ? { issues: this.issues } : {}) } };
  }
}

export function errorHandler(err: Error, c: Context) {
  if (err instanceof ApiError) {
    return c.json(err.toBody(), err.status);
  }
  const message = err instanceof Error ? err.message : String(err);
  // SQLite constraint failures surface as generic errors from D1; map the common ones.
  if (/UNIQUE constraint failed/i.test(message)) {
    return c.json({ error: { code: "conflict", message: "A record with the same unique value already exists" } } satisfies ApiErrorBody, 409);
  }
  if (/FOREIGN KEY constraint failed/i.test(message)) {
    return c.json({ error: { code: "bad_request", message: "Referenced record does not exist" } } satisfies ApiErrorBody, 400);
  }
  console.error("Unhandled error", err);
  return c.json({ error: { code: "internal", message: "Internal error" } } satisfies ApiErrorBody, 500);
}

/** Hook for @hono/zod-validator: turn validation failures into the standard envelope. */
export function validationHook(result: { success: boolean; error?: { issues: unknown[] } }) {
  if (!result.success) {
    throw new ApiError(400, "validation_error", "Validation failed", result.error?.issues ?? []);
  }
}
