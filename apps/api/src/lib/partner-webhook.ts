import type { FastifyBaseLogger } from "fastify";
import { env } from "../env.js";
import { sign, WEBHOOK_SIGNATURE_HEADER } from "./webhook/sign.js";

/**
 * Outbound webhook for Partner lifecycle events.
 *
 * Operator-only (the destination is a URL set by the operator in
 * PARTNER_WEBHOOK_URL — typically a Supabase Edge Function or similar
 * back-office hook). The point is to keep the operator's CRM in sync
 * with the partner table here without manual data entry.
 *
 * Best-effort delivery: we await with a timeout so any error surfaces in
 * logs, but we do NOT block on success — the partner row is already
 * committed by the time we fire. If the operator wants strict delivery
 * they can set up retries on the receiving side, or call the route
 * again to no-op (events are idempotent on partner_id).
 *
 * NEVER carries plaintext key material. The payload is metadata only:
 * partner id, name, status, contact, plus event-specific identifiers
 * (keyId on key events). Plaintext keys are still hand-delivered by
 * the operator — see UPGRADING.md.
 */

const TIMEOUT_MS = 5_000;

export type PartnerWebhookEvent =
  | {
      type: "partner.created";
      partner: PartnerWebhookPayload;
    }
  | {
      type: "partner.suspended" | "partner.reactivated";
      partner: PartnerWebhookPayload;
    }
  | {
      type: "partner.key.created" | "partner.key.revoked";
      partner: PartnerWebhookPayload;
      keyId: string;
      keyName: string;
    };

export type PartnerWebhookPayload = {
  id: string;
  name: string;
  status: "active" | "suspended";
  contactEmail: string | null;
  createdAt: string;
};

/** Fire-and-forget delivery. Returns nothing; logs on failure. Intended
 *  to be called inline at the end of a route handler — the await keeps
 *  the function from racing the response, but we swallow errors so a
 *  webhook outage never blocks partner provisioning.
 *
 *  Returns true on success, false on any failure (including unset env). */
export async function deliverPartnerWebhook(
  log: FastifyBaseLogger,
  event: PartnerWebhookEvent,
): Promise<boolean> {
  if (!env.PARTNER_WEBHOOK_URL || !env.PARTNER_WEBHOOK_SECRET) return false;

  // Restructure: `event` becomes the top-level discriminator field; the
  // rest of the union members (partner, keyId, ...) sit alongside it.
  // Destructure explicitly rather than relying on `type: undefined` +
  // JSON.stringify skipping undefined — clearer for future readers.
  const { type, ...rest } = event;
  const body = JSON.stringify({ event: type, ...rest });
  const signature = sign(body, env.PARTNER_WEBHOOK_SECRET);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(env.PARTNER_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [WEBHOOK_SIGNATURE_HEADER]: signature,
        "User-Agent": "OurTeamManagement-Partner-Webhook/1",
      },
      body,
      signal: ac.signal,
    });
    if (!res.ok) {
      log.warn(
        { event: event.type, status: res.status, partnerId: event.partner.id },
        "partner webhook delivery: non-2xx response",
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn(
      { err, event: event.type, partnerId: event.partner.id },
      "partner webhook delivery failed",
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
