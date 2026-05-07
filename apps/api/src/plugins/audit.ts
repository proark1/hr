import fp from "fastify-plugin";
import { withTenant } from "@myhr/db";
import { reqPath } from "../lib/path.js";

declare module "fastify" {
  interface FastifyRequest {
    auditAction?: string;
    auditResource?: string;
    auditMetadata?: Record<string, unknown>;
  }
}

const SKIP_PATHS = new Set(["/healthz", "/"]);

/**
 * Per-request audit log writer.
 *
 * Routes set `req.auditAction` (e.g. "employee.created") and optionally
 * `req.auditResource` ("employee:<uuid>"). On response, we persist an event
 * tagged with the tenant + actor (from X-Actor). Reads are recorded too —
 * GDPR Art. 30 expects logs of access to personal data, including failed
 * access. 5xx responses are tagged `failure: true` in metadata so incident
 * triage and access reviews see them.
 *
 * The insert runs in master mode because it happens after the request's own
 * transaction has closed, so the tenant session vars aren't set. The audit
 * table's RLS policies still control reads (only the tenant or master can
 * SELECT their own rows); writes are a system-level operation.
 */
export default fp(async (app) => {
  app.addHook("onResponse", async (req, reply) => {
    const path = reqPath(req.url);
    if (SKIP_PATHS.has(path) || path.startsWith("/openapi")) return;

    // Log anonymous requests too — auth failures and unauthenticated probes
    // are useful security signal. We can't tag them with a tenant.
    const isAnonymous = !req.caller;
    const tenantId = isAnonymous ? null : (req.tenantId ?? null);
    const actorType = req.caller?.type ?? "anonymous";
    const isFailure = reply.statusCode >= 500;

    // For partner callers, attach partner_id to every event so audit
    // queries can filter by partner ("show me everything OneTap did").
    // Route handlers can still add their own auditMetadata; this merges
    // before, so handlers can override if they need to.
    const partnerMeta =
      req.caller?.type === "partner"
        ? { partnerId: req.caller.partnerId, partnerKeyId: req.caller.keyId }
        : {};

    const action =
      req.auditAction ?? `${req.method.toLowerCase()} ${req.routeOptions?.url ?? path}`;

    try {
      await withTenant(
        app.prisma,
        { orgId: tenantId, isMaster: true },
        (tx) =>
          tx.auditEvent.create({
            data: {
              orgId: tenantId,
              actorType,
              actorId: req.actor?.id ?? null,
              actorEmail: req.actor?.email ?? null,
              action,
              resource: req.auditResource ?? null,
              ip: req.ip,
              userAgent: req.headers["user-agent"] ?? null,
              metadata: {
                method: req.method,
                path,
                status: reply.statusCode,
                ...partnerMeta,
                ...(isFailure ? { failure: true } : {}),
                ...(req.auditMetadata ?? {}),
              },
            },
          }),
      );
    } catch (err) {
      req.log.error({ err }, "audit log write failed");
    }
  });
});
