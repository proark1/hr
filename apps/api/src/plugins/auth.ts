import fp from "fastify-plugin";
import crypto from "node:crypto";
import { env } from "../env.js";
import { Errors } from "../errors.js";

export type Caller =
  | { type: "master"; keyId: string | null }
  | { type: "tenant"; keyId: string; orgId: string };

export type Actor = {
  id?: string;
  email?: string;
  name?: string;
};

declare module "fastify" {
  interface FastifyRequest {
    caller: Caller;
    actor: Actor;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Auth plugin.
 *
 * v1: validates the bootstrap MASTER_API_KEY (1tap's only credential).
 * In a follow-up PR we'll back this with the api_keys table so keys can be
 * rotated without redeploys, including tenant-scoped keys.
 *
 * The X-Actor header (optional JSON) attributes the request to a specific
 * 1tap user for the audit log. We do NOT verify a signature here — 1tap's
 * backend is the only caller and the master key already authenticates them.
 * If we expose tenant-scoped keys later we'll require X-Actor to be signed.
 */
export default fp(async (app) => {
  const masterKeyHash = sha256(env.MASTER_API_KEY);

  app.addHook("onRequest", async (req) => {
    // Health endpoint stays public
    if (req.url === "/healthz" || req.url === "/" || req.url.startsWith("/openapi")) return;

    const auth = req.headers.authorization;
    if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
      throw Errors.unauthorized();
    }
    const token = auth.slice(7).trim();
    if (!token || !timingSafeEqual(sha256(token), masterKeyHash)) {
      throw Errors.unauthorized();
    }

    req.caller = { type: "master", keyId: null };

    // Parse optional X-Actor header for audit attribution.
    const actorHeader = req.headers["x-actor"];
    if (typeof actorHeader === "string" && actorHeader.length > 0) {
      try {
        const parsed = JSON.parse(actorHeader) as Actor;
        req.actor = {
          id: typeof parsed.id === "string" ? parsed.id : undefined,
          email: typeof parsed.email === "string" ? parsed.email : undefined,
          name: typeof parsed.name === "string" ? parsed.name : undefined,
        };
      } catch {
        throw Errors.badRequest("X-Actor header must be valid JSON");
      }
    } else {
      req.actor = {};
    }
  });
});
