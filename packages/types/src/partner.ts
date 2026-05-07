import { z } from "zod";

export const PartnerStatus = z.enum(["active", "suspended"]);
export type PartnerStatus = z.infer<typeof PartnerStatus>;

export const Partner = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: PartnerStatus,
  contactEmail: z.string().email().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  suspendedAt: z.string().datetime().nullable(),
});
export type Partner = z.infer<typeof Partner>;

export const PartnerCreate = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().email().optional(),
  notes: z.string().max(2000).optional(),
});
export type PartnerCreate = z.infer<typeof PartnerCreate>;

export const PartnerUpdate = z.object({
  name: z.string().min(1).max(200).optional(),
  contactEmail: z.string().email().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: PartnerStatus.optional(),
});
export type PartnerUpdate = z.infer<typeof PartnerUpdate>;

/** Partner-scoped API key (without plaintext secret). */
export const PartnerKey = z.object({
  id: z.string().uuid(),
  partnerId: z.string().uuid(),
  name: z.string(),
  prefix: z.string().describe("First 24 chars of the key, used for display + lookup."),
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});
export type PartnerKey = z.infer<typeof PartnerKey>;

export const PartnerKeyCreate = z.object({
  name: z.string().min(1).max(200),
});
export type PartnerKeyCreate = z.infer<typeof PartnerKeyCreate>;

/** Response from POST /v1/partners/:id/keys. The plaintext `key` is shown once. */
export const PartnerKeyCreated = PartnerKey.extend({
  key: z
    .string()
    .describe("Plaintext key, shown only once. Store securely (this won't be retrievable)."),
});
export type PartnerKeyCreated = z.infer<typeof PartnerKeyCreated>;
