import crypto from "node:crypto";

/** Header value emitted on every webhook delivery. Format mirrors Stripe's
 *  `t=<unix-seconds>,v1=<hex-hmac-sha256>` so consumers can reuse standard
 *  verification helpers if they want.
 *
 *  Body MUST be the raw request bytes the consumer received — JSON.stringify
 *  on the parsed object is not equivalent (key order, whitespace). */
export const WEBHOOK_SIGNATURE_HEADER = "Webhook-Signature";

/** Replay window: reject inbound headers whose `t` is older than this. The
 *  consumer enforces this; we expose the same constant for parity. */
export const WEBHOOK_REPLAY_WINDOW_SEC = 5 * 60;

export function sign(
  rawBody: string,
  secret: string,
  unixSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const payload = `${unixSeconds}.${rawBody}`;
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return `t=${unixSeconds},v1=${hmac}`;
}

/** Constant-time comparison helper for consumers verifying a header. Exposed
 *  here so the SDK can re-export it without rolling its own. */
export function verify(
  rawBody: string,
  secret: string,
  header: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  ) as { t?: string; v1?: string };
  if (!parts.t || !parts.v1) return false;
  const t = Number(parts.t);
  if (!Number.isFinite(t)) return false;
  if (Math.abs(nowSec - t) > WEBHOOK_REPLAY_WINDOW_SEC) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  const got = Buffer.from(parts.v1, "hex");
  const exp = Buffer.from(expected, "hex");
  return got.length === exp.length && crypto.timingSafeEqual(got, exp);
}
