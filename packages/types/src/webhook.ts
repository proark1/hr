import { z } from "zod";

/** Event types MyHR will fire. Add new event types here when new emit
 *  call-sites land — the publisher rejects unknown types so consumers
 *  can rely on the enum being authoritative. */
export const WebhookEventType = z.enum([
  "employee.created",
  "employee.updated",
  "employee.deleted",
  "document.expiring",
]);
export type WebhookEventType = z.infer<typeof WebhookEventType>;

export const WebhookDeliveryStatus = z.enum([
  "pending",
  "in_progress",
  "delivered",
  "failed_retrying",
  "failed_permanent",
]);
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatus>;

/** A registered webhook endpoint. The signing secret is omitted by default
 *  and only returned on creation (and on explicit secret rotation). */
export const WebhookEndpoint = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  url: z.string().url(),
  events: z.array(WebhookEventType),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WebhookEndpoint = z.infer<typeof WebhookEndpoint>;

/** Returned only at creation / rotation — the plaintext signing secret is
 *  never persisted in plaintext outside the row, and never returned again. */
export const WebhookEndpointWithSecret = WebhookEndpoint.extend({
  secret: z
    .string()
    .describe(
      "Plaintext signing secret. Returned only at creation and explicit rotation. Use this to verify the `Webhook-Signature` header on inbound deliveries.",
    ),
});
export type WebhookEndpointWithSecret = z.infer<typeof WebhookEndpointWithSecret>;

export const WebhookEndpointCreate = z.object({
  url: z
    .string()
    .url()
    .regex(/^https:\/\//, "url must start with https://"),
  events: z.array(WebhookEventType).min(1),
});
export type WebhookEndpointCreate = z.infer<typeof WebhookEndpointCreate>;

export const WebhookEndpointUpdate = z.object({
  url: z
    .string()
    .url()
    .regex(/^https:\/\//, "url must start with https://")
    .optional(),
  events: z.array(WebhookEventType).min(1).optional(),
  isActive: z.boolean().optional(),
});
export type WebhookEndpointUpdate = z.infer<typeof WebhookEndpointUpdate>;

export const WebhookDelivery = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  endpointId: z.string().uuid(),
  eventId: z.string().uuid(),
  eventType: WebhookEventType,
  status: WebhookDeliveryStatus,
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  lastResponseCode: z.number().int().nullable(),
  lastResponseBody: z.string().nullable(),
  lastError: z.string().nullable(),
  lastAttemptAt: z.string().datetime().nullable(),
  nextAttemptAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type WebhookDelivery = z.infer<typeof WebhookDelivery>;

export const WebhookDeliveryListQuery = z.object({
  endpointId: z.string().uuid().optional(),
  eventType: WebhookEventType.optional(),
  status: WebhookDeliveryStatus.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type WebhookDeliveryListQuery = z.infer<typeof WebhookDeliveryListQuery>;
