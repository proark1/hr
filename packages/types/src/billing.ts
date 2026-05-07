import { z } from "zod";

export const BillingMode = z.enum(["invoice", "subscription", "partner"]);
export type BillingMode = z.infer<typeof BillingMode>;

/** Read-only snapshot of the org's billing state. No payment integration in
 *  this MVP — we just expose the columns already on `orgs` plus a live seat
 *  count derived from active employees. */
export const BillingSnapshot = z.object({
  orgId: z.string().uuid(),
  plan: z.string().nullable(),
  billingMode: BillingMode,
  stripeCustomerId: z.string().nullable(),
  stripeSubscriptionId: z.string().nullable(),
  seats: z.object({
    used: z.number().int().min(0).describe("Active (non-deleted) employees in this org."),
  }),
});
export type BillingSnapshot = z.infer<typeof BillingSnapshot>;
