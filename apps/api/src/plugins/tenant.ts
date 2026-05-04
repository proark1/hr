import fp from "fastify-plugin";
import { Errors } from "../errors.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Tenant org id for this request, from X-Tenant-Id. Null on master-only routes. */
    tenantId: string | null;
  }
  interface FastifyContextConfig {
    /** When true, X-Tenant-Id is required and must reference an existing org. */
    requireTenant?: boolean;
    /** When true, only master callers may hit this route. */
    masterOnly?: boolean;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default fp(async (app) => {
  app.addHook("preHandler", async (req) => {
    if (req.url === "/healthz" || req.url === "/" || req.url.startsWith("/openapi")) return;

    const cfg = req.routeOptions?.config ?? {};
    const tenantHeader = req.headers["x-tenant-id"];
    const tenantId = typeof tenantHeader === "string" ? tenantHeader : null;

    if (tenantId && !UUID_RE.test(tenantId)) {
      throw Errors.badRequest("X-Tenant-Id must be a UUID");
    }
    req.tenantId = tenantId;

    if (cfg.masterOnly && req.caller?.type !== "master") {
      throw Errors.forbidden("Master key required");
    }
    if (cfg.requireTenant && !tenantId) {
      throw Errors.tenantRequired();
    }
  });
});
