/**
 * Auth plugin (orchestrator).
 *
 * Three caller strategies tried in order:
 *
 *   1. Bearer token starting with "mh_": try master env match first, then
 *      look up in api_keys for tenant-scoped keys. Master callers may
 *      attribute the request to a specific user via X-Actor.
 *
 *   2. Any other Bearer token: try the external auth service (proark1/auth)
 *      JWT verification. The web app forwards the user's access token; we
 *      verify the signature against the service's JWKS, pin issuer +
 *      audience, then synthesize the actor from the verified claims.
 *      Client-supplied X-Actor is ignored to prevent spoofing.
 *
 *   3. No match: 401.
 *
 * The orchestrator stays small; each strategy lives in its own file.
 */

import fp from "fastify-plugin";
import { Errors } from "../../errors.js";
import { reqPath } from "../../lib/path.js";
import type { Caller, Actor } from "./types.js";
import { API_KEY_PREFIX } from "./shared.js";
import { tryMaster, parseMasterActor } from "./master.js";
import { tryTenantKey } from "./tenant-key.js";
import { tryUser } from "./user.js";

export type { Caller, Actor };

export default fp(async (app) => {
  app.addHook("onRequest", async (req) => {
    const path = reqPath(req.url);
    if (path === "/healthz" || path === "/" || path.startsWith("/openapi")) return;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      throw Errors.unauthorized();
    }
    const token = authHeader.slice(7).trim();
    if (!token) throw Errors.unauthorized();

    if (token.startsWith(API_KEY_PREFIX)) {
      // Master takes precedence — env-var compare, no DB hit.
      const master = tryMaster(token);
      if (master) {
        req.caller = master;
        req.actor = parseMasterActor(req.headers["x-actor"]);
        return;
      }
      // Fall through to tenant-key lookup.
      const tenant = await tryTenantKey(app.prisma, token);
      if (tenant) {
        req.caller = tenant;
        req.actor = {}; // tenant-key callers don't get to assert an actor
        return;
      }
      throw Errors.unauthorized();
    }

    // Non-mh_ token: try the external auth service JWT.
    const user = await tryUser(app.prisma, token);
    if (user) {
      req.caller = user.caller;
      req.actor = user.actor;
      return;
    }

    throw Errors.unauthorized();
  });
});
