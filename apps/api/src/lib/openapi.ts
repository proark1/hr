import { z } from "zod";

/**
 * Standard error envelope returned by the API. Matches the shape produced by
 * server.ts:setErrorHandler so generated SDKs can type-narrow on `error.code`.
 */
export const ErrorResponse = z
  .object({
    error: z.object({
      code: z.string().describe("Machine-readable error code, e.g. `not_found`."),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .describe("Standard error envelope");

const STATUS_DESCRIPTIONS: Record<number, string> = {
  400: "Validation or request shape error.",
  401: "Missing or invalid API key.",
  403: "Caller is authenticated but not allowed to perform this action.",
  404: "Resource not found.",
  409: "Conflict — e.g. unique constraint violation, or Idempotency-Key reused with a different body.",
  500: "Unexpected server error.",
};

/**
 * Build a `response` map that wires ErrorResponse to the given status codes.
 * Use spread alongside the success response, e.g.
 *
 *   response: { 200: Employee, ...errorResponses(400, 401, 403, 404) }
 */
export function errorResponses(
  ...codes: Array<keyof typeof STATUS_DESCRIPTIONS>
): Record<number, typeof ErrorResponse> {
  const out: Record<number, typeof ErrorResponse> = {};
  for (const c of codes) {
    out[c] = ErrorResponse.describe(STATUS_DESCRIPTIONS[c] ?? "Error response");
  }
  return out;
}

/** Header schema fragments. Compose into a route's `schema.headers` via merge. */
const TenantHeader = z.object({
  "x-tenant-id": z
    .string()
    .uuid()
    .describe("Tenant org id. Required on all tenant-scoped endpoints."),
});

const ActorHeader = z.object({
  "x-actor": z
    .string()
    .optional()
    .describe(
      "Optional JSON `{ id?, email?, name? }` attributing this request to a specific 1tap user for the audit log.",
    ),
});

const IdempotencyHeader = z.object({
  "idempotency-key": z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Required on all writes (POST/PATCH/DELETE). Replays return the cached response. Reusing a key with a different body returns 409.",
    ),
});

/** Headers for tenant-scoped read endpoints. */
export const tenantReadHeaders = TenantHeader.merge(ActorHeader);

/** Headers for tenant-scoped write endpoints. */
export const tenantWriteHeaders = TenantHeader.merge(IdempotencyHeader).merge(ActorHeader);

/** Headers for master-only read endpoints. */
export const masterReadHeaders = ActorHeader;

/** Headers for master-only write endpoints. */
export const masterWriteHeaders = IdempotencyHeader.merge(ActorHeader);
