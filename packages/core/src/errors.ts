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
  /**
   * A request touched a capability the caller's plan doesn't include. Returns
   * 402 with an actionable payload (which plan unlocks it, the price, and how to
   * upgrade) so a dev can resolve it straight from the response. The caller
   * computes `required_plan`/price/urls and passes them in — this keeps the
   * errors module free of plan/pricing imports.
   */
  featureLocked: (
    feature: string,
    opts: {
      current_plan: string;
      required_plan: string | null;
      required_plan_name?: string | null;
      price?: number | null;
      upgrade_url?: string | null;
      checkout_endpoint?: string | null;
      docs_url?: string | null;
      message?: string;
    },
  ) => {
    const target = opts.required_plan_name ?? opts.required_plan ?? "a higher plan";
    const message =
      opts.message ??
      `Your ${opts.current_plan} plan doesn't include "${feature}". Upgrade to ${target} to unlock it.`;
    return new AppError(402, "feature_locked", message, {
      feature,
      current_plan: opts.current_plan,
      required_plan: opts.required_plan,
      required_plan_name: opts.required_plan_name ?? null,
      price: opts.price ?? null,
      upgrade_url: opts.upgrade_url ?? null,
      checkout_endpoint: opts.checkout_endpoint ?? null,
      docs_url: opts.docs_url ?? null,
    });
  },
  badRequest: (message = "Bad request", details?: unknown) =>
    new AppError(400, "bad_request", message, details),
  internal: (message = "Internal server error") => new AppError(500, "internal_error", message),
};
