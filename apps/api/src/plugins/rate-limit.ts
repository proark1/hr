/**
 * Token-bucket rate limiter, keyed per authenticated caller.
 *
 *   - capacity   = RATE_LIMIT_BURST     (default 60)
 *   - refill     = RATE_LIMIT_PER_MINUTE / 60 tokens/sec  (default 10/sec)
 *
 * Long-term steady state is RATE_LIMIT_PER_MINUTE requests/minute. Short
 * spikes up to `capacity` are absorbed without 429-ing.
 *
 * Storage is in-process (a `Map` of buckets). `railway.json` pins
 * `numReplicas: 1` so this is correct in prod — if anyone bumps that,
 * swap this plugin for a Redis-backed bucket before scaling out
 * (the bucket interface is intentionally tiny so the rewrite is local).
 *
 * Public routes (`/`, `/healthz`, `/openapi*`) are skipped — they don't
 * carry a caller and we want unauthenticated probes to always succeed.
 *
 * Headers on every authenticated response (RFC 9239 / draft-ietf-httpapi-
 * ratelimit-headers):
 *   - RateLimit-Limit:     advertised per-minute rate
 *   - RateLimit-Remaining: tokens currently in bucket (floor)
 *   - RateLimit-Reset:     seconds until bucket is back to full
 *
 * On 429, additionally:
 *   - Retry-After: seconds the caller should wait before retrying
 */

import fp from "fastify-plugin";
import { env } from "../env.js";
import { Errors } from "../errors.js";
import { reqPath } from "../lib/path.js";
import type { Caller } from "./auth/types.js";

type Bucket = { tokens: number; lastRefillMs: number };

/** How long an idle bucket is kept around before being garbage-collected.
 *  Long enough that bursty workloads don't lose their accumulated tokens
 *  between batches; short enough that we don't accumulate stale entries. */
const PRUNE_AGE_MS = 10 * 60 * 1000;
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;

function bucketKey(caller: Caller | undefined): string | null {
  if (!caller) return null;
  switch (caller.type) {
    case "master":
      return `master:${caller.keyId ?? "env"}`;
    case "tenant_key":
      return `tenant:${caller.keyId}`;
    case "user":
      return `user:${caller.userId}`;
  }
}

function isPublicPath(path: string): boolean {
  return path === "/" || path === "/healthz" || path.startsWith("/openapi");
}

export default fp(async (app) => {
  if (env.RATE_LIMIT_DISABLED) {
    app.log.warn("rate-limit plugin disabled via RATE_LIMIT_DISABLED");
    return;
  }

  const buckets = new Map<string, Bucket>();
  const capacity = env.RATE_LIMIT_BURST;
  const refillPerSec = env.RATE_LIMIT_PER_MINUTE / 60;

  // Periodic prune. Buckets that are full (no recent activity drained them)
  // and untouched for PRUNE_AGE_MS get evicted so the map doesn't grow
  // unbounded across many distinct keys.
  const pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (b.tokens >= capacity && now - b.lastRefillMs > PRUNE_AGE_MS) {
        buckets.delete(k);
      }
    }
  }, PRUNE_INTERVAL_MS);
  pruneTimer.unref?.();
  app.addHook("onClose", async () => clearInterval(pruneTimer));

  // Run after auth (req.caller is set) but before route handlers.
  app.addHook("preHandler", async (req, reply) => {
    const path = reqPath(req.url);
    if (isPublicPath(path)) return;

    const key = bucketKey(req.caller);
    if (!key) return; // auth would have 401'd; defensive

    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefillMs: now };
      buckets.set(key, bucket);
    } else {
      const elapsedSec = (now - bucket.lastRefillMs) / 1000;
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
      bucket.lastRefillMs = now;
    }

    void reply.header("RateLimit-Limit", env.RATE_LIMIT_PER_MINUTE);

    if (bucket.tokens < 1) {
      const retryAfter = Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerSec));
      void reply.header("RateLimit-Remaining", 0);
      void reply.header("RateLimit-Reset", retryAfter);
      void reply.header("Retry-After", retryAfter);
      throw Errors.rateLimited(retryAfter);
    }

    bucket.tokens -= 1;
    const secsToFull = Math.ceil((capacity - bucket.tokens) / refillPerSec);
    void reply.header("RateLimit-Remaining", Math.floor(bucket.tokens));
    void reply.header("RateLimit-Reset", secsToFull);
  });
});
