export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const Errors = {
  unauthorized: (msg = "Missing or invalid API key") =>
    new ApiError(401, "unauthorized", msg),
  forbidden: (msg = "Forbidden") => new ApiError(403, "forbidden", msg),
  notFound: (msg = "Not found") => new ApiError(404, "not_found", msg),
  conflict: (msg = "Conflict", details?: unknown) =>
    new ApiError(409, "conflict", msg, details),
  badRequest: (msg = "Bad request", details?: unknown) =>
    new ApiError(400, "bad_request", msg, details),
  tenantRequired: () =>
    new ApiError(400, "tenant_required", "X-Tenant-Id header is required for this endpoint"),
};
