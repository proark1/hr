import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    auditAction?: string;
    auditResource?: string;
    auditMetadata?: Record<string, unknown>;
  }
}

const SKIP_URLS = new Set(["/healthz", "/", "/openapi.json"]);

/**
 * Per-request audit log writer.
 *
 * Routes set `req.auditAction` (e.g. "employee.created") and optionally
 * `req.auditResource` ("employee:<uuid>"). On response, we persist an event
 * tagged with the tenant + actor (from X-Actor). Reads are recorded too —
 * GDPR Art. 30 expects logs of access to personal data.
 */
export default fp(async (app) => {
  app.addHook("onResponse", async (req, reply) => {
    if (SKIP_URLS.has(req.url) || req.url.startsWith("/openapi")) return;
    if (!req.caller) return;
    if (reply.statusCode >= 500) return;

    const action =
      req.auditAction ?? `${req.method.toLowerCase()} ${req.routeOptions?.url ?? req.url}`;

    try {
      await app.prisma.auditEvent.create({
        data: {
          orgId: req.tenantId ?? null,
          actorType: req.caller.type,
          actorId: req.actor?.id ?? null,
          actorEmail: req.actor?.email ?? null,
          action,
          resource: req.auditResource ?? null,
          ip: req.ip,
          userAgent: req.headers["user-agent"] ?? null,
          metadata: {
            method: req.method,
            path: req.url,
            status: reply.statusCode,
            ...(req.auditMetadata ?? {}),
          },
        },
      });
    } catch (err) {
      req.log.error({ err }, "audit log write failed");
    }
  });
});
