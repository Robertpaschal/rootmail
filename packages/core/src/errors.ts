/** Application error with an HTTP status + stable machine-readable code. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { error: { type: this.code, message: this.message, details: this.details } };
  }
}

export const Errors = {
  unauthorized: (message = "Invalid or missing API key") =>
    new AppError(401, "unauthorized", message),
  forbidden: (message = "You do not have access to this resource") =>
    new AppError(403, "forbidden", message),
  notFound: (message = "Resource not found") => new AppError(404, "not_found", message),
  conflict: (message = "Resource already exists", details?: unknown) =>
    new AppError(409, "conflict", message, details),
  validation: (message = "Validation failed", details?: unknown) =>
    new AppError(422, "validation_error", message, details),
  rateLimited: (message = "Rate limit exceeded") => new AppError(429, "rate_limited", message),
  quotaExceeded: (message = "Monthly send limit reached", details?: unknown) =>
    new AppError(402, "quota_exceeded", message, details),
  badRequest: (message = "Bad request", details?: unknown) =>
    new AppError(400, "bad_request", message, details),
  internal: (message = "Internal server error") => new AppError(500, "internal_error", message),
};
