import crypto from "node:crypto";

/** Header OurTeamManagement sets on every webhook delivery. */
export const WEBHOOK_SIGNATURE_HEADER = "Webhook-Signature";

/** Replay window: reject deliveries whose `t` is older than this. */
export const WEBHOOK_REPLAY_WINDOW_SEC = 5 * 60;

/**
 * Verify a `Webhook-Signature` header value against a raw request body and
 * the endpoint's signing secret.
 *
 *   const ok = verifyWebhookSignature({
 *     rawBody: req.rawBody,             // exact bytes received
 *     header: req.headers["webhook-signature"],
 *     secret: process.env.WEBHOOK_SIGNING_SECRET!,
 *   });
 *   if (!ok) return res.status(400).send();
 *
 * Returns false on missing header, malformed format, replay-window violation,
 * or signature mismatch. Always uses constant-time comparison.
 */
export function verifyWebhookSignature(args: {
  rawBody: string;
  header: string | string[] | undefined;
  secret: string;
  /** Override `now` for testing. */
  nowSec?: number;
}): boolean {
  const { rawBody, secret } = args;
  const header = Array.isArray(args.header) ? args.header[0] : args.header;
  if (!header) return false;
  const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000);

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
