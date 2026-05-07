import fp from "fastify-plugin";
import { withTenant, type MembershipRole } from "@myhr/db";
import { Errors } from "../errors.js";
import { reqPath } from "../lib/path.js";

type CallerType = "master" | "partner" | "tenant_key" | "user";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Tenant org id for this request. Resolution depends on caller type:
     *   master     → X-Tenant-Id header
     *   partner    → X-Tenant-Id header, validated to belong to the partner
     *   tenant_key → caller.orgId (key is org-scoped)
     *   user       → X-Org-Id header, validated against memberships
     */
    tenantId: string | null;
    /**
     * For user callers, the role they hold in `tenantId`. Null for master,
     * tenant_key, and for user callers without a tenant context.
     */
    callerRole: MembershipRole | null;
  }

  interface FastifyContextConfig {
    /** Tenant context required. Without it, returns 400 tenant_required. */
    requireTenant?: boolean;
    /**
     * Restricts which caller types may hit this route. Defaults to all
     * three. Setting `masterOnly: true` is equivalent to
     * `allowedCallers: ["master"]` (kept as a backward-compat alias).
     */
    allowedCallers?: ReadonlyArray<CallerType>;
    /**
     * For user callers: requires membership in the resolved tenant. If
     * `roles` is set, the user's role must be one of them. Master and
     * tenant_key callers bypass this check (they're machines).
     * Implies `requireTenant: true`.
     */
    requireMembership?: { roles?: ReadonlyArray<MembershipRole> };
    /**
     * For user callers: requires `isSuperAdmin = true`. Master and
     * tenant_key callers are rejected — superadmin endpoints are for
     * OurTeamManagement ops humans only. Master has its own master-scoped endpoints.
     */
    requireSuperAdmin?: true;
    /** @deprecated alias for `allowedCallers: ["master"]`. */
    masterOnly?: boolean;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_ALLOWED: ReadonlyArray<CallerType> = ["master", "partner", "tenant_key", "user"];

export default fp(async (app) => {
  app.addHook("preHandler", async (req) => {
    const path = reqPath(req.url);
    if (path === "/healthz" || path === "/" || path.startsWith("/openapi")) return;

    const cfg = req.routeOptions?.config ?? {};
    const caller = req.caller;
    if (!caller) return; // auth plugin would have thrown — defensive

    // 1. Caller-type allowlist (with masterOnly back-compat).
    const allowed: ReadonlyArray<CallerType> = cfg.allowedCallers
      ?? (cfg.masterOnly ? ["master"] : DEFAULT_ALLOWED);
    if (!allowed.includes(caller.type)) {
      throw Errors.forbidden(`This route does not accept ${caller.type} callers`);
    }

    // 2. Resolve tenantId per caller type.
    let tenantId: string | null = null;
    let callerRole: MembershipRole | null = null;

    if (caller.type === "master") {
      const h = req.headers["x-tenant-id"];
      tenantId = typeof h === "string" ? h : null;
      if (tenantId && !UUID_RE.test(tenantId)) {
        throw Errors.badRequest("X-Tenant-Id must be a UUID");
      }
    } else if (caller.type === "partner") {
      const h = req.headers["x-tenant-id"];
      tenantId = typeof h === "string" ? h : null;
      if (tenantId && !UUID_RE.test(tenantId)) {
        throw Errors.badRequest("X-Tenant-Id must be a UUID");
      }
      // Defense in depth: validate partner ownership at the app layer
      // before downstream code drops into single-org mode (where RLS
      // checks org_id only). RLS on `orgs` would also reject this, but
      // catching it here gives a clean 404 instead of opaque downstream
      // failures, and prevents leaking org existence to non-owning
      // partners (404 looks identical to "no such org").
      if (tenantId) {
        const orgId = tenantId;
        const partnerId = caller.partnerId;
        const owned = await withTenant(
          app.prisma,
          { orgId: null, isMaster: true },
          (tx) =>
            tx.org.findFirst({
              where: { id: orgId, partnerId, deletedAt: null },
              select: { id: true },
            }),
        );
        if (!owned) throw Errors.notFound();
      }
    } else if (caller.type === "tenant_key") {
      tenantId = caller.orgId;
    } else {
      const h = req.headers["x-org-id"];
      tenantId = typeof h === "string" ? h : null;
      if (tenantId && !UUID_RE.test(tenantId)) {
        throw Errors.badRequest("X-Org-Id must be a UUID");
      }
      if (tenantId) {
        const m = caller.memberships.find((m) => m.orgId === tenantId);
        if (!m) throw Errors.forbidden("You are not a member of this org");
        callerRole = m.role;
      }
    }
    req.tenantId = tenantId;
    req.callerRole = callerRole;

    // 3. requireTenant (also implied by requireMembership).
    const tenantNeeded = cfg.requireTenant || cfg.requireMembership !== undefined;
    if (tenantNeeded && !tenantId) {
      throw Errors.tenantRequired(caller.type === "user" ? "X-Org-Id" : "X-Tenant-Id");
    }

    // 4. requireMembership: enforce role for user callers; master + tenant_key bypass.
    if (cfg.requireMembership && caller.type === "user") {
      const allowedRoles = cfg.requireMembership.roles;
      if (allowedRoles && callerRole && !allowedRoles.includes(callerRole)) {
        throw Errors.forbidden(`Requires one of: ${allowedRoles.join(", ")}`);
      }
    }

    // 5. requireSuperAdmin: operator-level routes. Root master callers
    //    pass automatically (they're more privileged than any user); user
    //    callers must have isSuperAdmin=true. Partner and tenant_key
    //    callers are rejected — these are integrator credentials, not
    //    operator credentials. (Pair with allowedCallers to constrain
    //    further when needed.)
    if (cfg.requireSuperAdmin) {
      const isOperator =
        caller.type === "master" ||
        (caller.type === "user" && caller.isSuperAdmin);
      if (!isOperator) {
        throw Errors.forbidden("Super admin only");
      }
    }
  });
});
