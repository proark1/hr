/**
 * Auth plugin (orchestrator).
 *
 * Caller strategies for `mh_`-prefixed Bearer tokens, tried in order:
 *
 *   1. Root master env match (cheapest — no DB hit). Honors X-Actor for
 *      audit attribution (operator is trusted to assert an actor).
 *   2. Partner key: api_keys row with scope='partner'. Owning partner
 *      must be `active`. X-Actor honored — partners are trusted machine
 *      callers attributing actions to their own end users.
 *   3. Tenant key: api_keys row with scope='tenant'. X-Actor ignored.
 *
 * For non-`mh_` Bearer tokens, defers to the external auth service
 * (proark1/auth) JWT path; X-Actor ignored (the JWT is the source of
 * truth for actor identity).
 *
 * The orchestrator stays small; each strategy lives in its own file.
 */

import fp from "fastify-plugin";
import { Errors } from "../../errors.js";
import { reqPath } from "../../lib/path.js";
import type { Caller, Actor } from "./types.js";
import { API_KEY_PREFIX } from "./shared.js";
import { tryMaster, parseMasterActor } from "./master.js";
import { tryPartnerKey } from "./partner.js";
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
      // Root master takes precedence — env-var compare, no DB hit.
      const master = tryMaster(token);
      if (master) {
        req.caller = master;
        req.actor = parseMasterActor(req.headers["x-actor"]);
        return;
      }
      // Then partner keys (cross-tenant within partner-owned orgs).
      const partner = await tryPartnerKey(app.prisma, token);
      if (partner) {
        req.caller = partner;
        req.actor = parseMasterActor(req.headers["x-actor"]);
        return;
      }
      // Then tenant-scoped keys (single-org).
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
