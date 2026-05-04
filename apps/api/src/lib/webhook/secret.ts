import crypto from "node:crypto";

/** Generate a fresh signing secret. 32 random bytes → 64 hex chars; prefixed
 *  with `whsec_` so it's identifiable in logs and the dashboard. */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString("hex")}`;
}
