/**
 * Webhook event specs added to the spec under `x-webhooks` (Redoc renders
 * this alongside paths). The 1tap integrator implements these handlers; the
 * shape is the contract.
 *
 * MVP: forward-looking. Delivery, signing, and retries land in a follow-up.
 * The schema lives here (not in @myhr/types) until we actually fire events,
 * to avoid leaking forward-looking types into the SDK.
 */

type Json = Record<string, unknown>;

const eventEnvelope = (eventType: string, dataExample: unknown): Json => ({
  type: "object",
  required: ["id", "type", "createdAt", "orgId", "data"],
  properties: {
    id: {
      type: "string",
      format: "uuid",
      description: "Unique event id. Use as the deduplication key.",
    },
    type: {
      type: "string",
      enum: [eventType],
      description: "Event type. Always present; safe to switch on.",
    },
    createdAt: { type: "string", format: "date-time" },
    orgId: {
      type: "string",
      format: "uuid",
      description: "Tenant org the event applies to.",
    },
    data: { type: "object" },
  },
  example: {
    id: "ev_01HXYZ0000000000000001",
    type: eventType,
    createdAt: "2026-05-04T12:00:00.000Z",
    orgId: "11111111-2222-3333-4444-555555555555",
    data: dataExample,
  },
});

const employeeData = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  email: "ada@acme.com",
  firstName: "Ada",
  lastName: "Lovelace",
  status: "active",
};

function webhook(args: {
  summary: string;
  description: string;
  eventType: string;
  dataExample: unknown;
}): Json {
  // Webhook operationIds intentionally use the same dot-form as the
  // event `type` field — clients commonly key handlers off this string.
  return {
    post: {
      operationId: `webhook.${args.eventType}`,
      tags: ["Webhooks"],
      summary: args.summary,
      description: args.description,
      // Webhook handlers don't authenticate against MyHR — they validate
      // the inbound HMAC signature. Mark public so Redoc renders cleanly.
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: eventEnvelope(args.eventType, args.dataExample),
          },
        },
      },
      responses: {
        "2XX": {
          description:
            "Any 2xx is treated as success. Non-2xx triggers retry with exponential backoff (max 24h).",
        },
      },
      "x-webhook-signature": {
        header: "Webhook-Signature",
        description:
          "`t=<unix-seconds>,v1=<hex-hmac-sha256>`. Compute HMAC-SHA256 of `<t>.<raw-body>` using the org's webhook signing secret (rotatable via the dashboard) and compare in constant time. Reject events with `t` more than 5 minutes in the past.",
      },
    },
  };
}

export const WEBHOOKS: Record<string, Json> = {
  "employee.created": webhook({
    summary: "Fired when an employee is created",
    description:
      "Emitted on every successful `POST /v1/employees`. The payload is the same shape returned by the create endpoint (minus encrypted-at-rest fields).",
    eventType: "employee.created",
    dataExample: employeeData,
  }),
  "employee.updated": webhook({
    summary: "Fired when an employee is updated",
    description:
      "Emitted after a successful `PATCH /v1/employees/{id}` whenever any persisted field changes. Re-emitted only if the post-write state differs.",
    eventType: "employee.updated",
    dataExample: { ...employeeData, status: "on_leave" },
  }),
  "employee.deleted": webhook({
    summary: "Fired when an employee is deleted (GDPR Art. 17)",
    description:
      "Emitted when an employee is soft-deleted. PII has already been redacted at this point — only `id`, `orgId`, and `deletedAt` are guaranteed.",
    eventType: "employee.deleted",
    dataExample: {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      deletedAt: "2026-05-04T12:00:00.000Z",
    },
  }),
  "document.expiring": webhook({
    summary: "Fired ahead of a document's expiry",
    description:
      "Emitted at 30 / 14 / 7 / 1 days before `document.expiresAt` so 1tap can notify the employee or HR. Each window fires exactly once per document.",
    eventType: "document.expiring",
    dataExample: {
      documentId: "dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb",
      employeeId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      kind: "visa",
      expiresAt: "2026-06-04T00:00:00.000Z",
      daysUntilExpiry: 30,
    },
  }),
};
