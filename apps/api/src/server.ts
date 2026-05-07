import Fastify from "fastify";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";

import { env } from "./env.js";
import { ApiError } from "./errors.js";

const GENERIC_4XX_MESSAGES: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  405: "Method not allowed",
  406: "Not acceptable",
  409: "Conflict",
  410: "Gone",
  413: "Payload too large",
  415: "Unsupported media type",
  422: "Unprocessable entity",
  429: "Too many requests",
};
import { apiDescription } from "./lib/api-description.js";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth/index.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import tenantPlugin from "./plugins/tenant.js";
import idempotencyPlugin from "./plugins/idempotency.js";
import auditPlugin from "./plugins/audit.js";
import webhooksPlugin from "./plugins/webhooks.js";

import healthRoutes from "./routes/health.js";
import orgRoutes from "./routes/orgs.js";
import partnerRoutes from "./routes/partners.js";
import employeeRoutes from "./routes/employees.js";
import meRoutes from "./routes/me.js";
import memberRoutes from "./routes/members.js";
import invitationRoutes, { invitationAcceptRoutes } from "./routes/invitations.js";
import apiKeyRoutes from "./routes/api-keys.js";
import superAdminRoutes from "./routes/superadmin.js";
import webhookEndpointRoutes from "./routes/webhook-endpoints.js";
import webhookDeliveryRoutes from "./routes/webhook-deliveries.js";
import timeOffRoutes from "./routes/time-off.js";
import documentRoutes from "./routes/documents.js";
import reviewRoutes from "./routes/reviews.js";
import companyRoutes from "./routes/company.js";
import settingsRoutes from "./routes/settings.js";
import billingRoutes from "./routes/billing.js";
import orgChartRoutes from "./routes/org-chart.js";

export async function buildServer() {
  const loggerOpts: Record<string, unknown> = {
    level: env.LOG_LEVEL,
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie"],
      censor: "[redacted]",
    },
  };
  if (env.NODE_ENV === "development") {
    loggerOpts.transport = { target: "pino-pretty", options: { colorize: true } };
  }

  const app = Fastify({
    logger: loggerOpts,
    trustProxy: true,
    bodyLimit: 1 * 1024 * 1024,
    ignoreTrailingSlash: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
    }
    // Fastify validation failures (Zod / fastify-type-provider-zod) carry
    // statusCode 400 and a structured `validation` field. Surface the
    // validation details so clients can react, but normalize the code.
    if (
      "statusCode" in err &&
      typeof err.statusCode === "number" &&
      err.statusCode === 400 &&
      "validation" in err
    ) {
      return reply.code(400).send({
        error: {
          code: "bad_request",
          message: "Request validation failed",
          details: (err as { validation: unknown }).validation,
        },
      });
    }
    // Other 4xx — DON'T echo err.message verbatim. Prisma's known-error
    // messages contain table/column names and parameter values that we
    // shouldn't leak to clients. Routes are expected to map domain errors
    // to ApiError; anything else gets a generic message.
    if ("statusCode" in err && typeof err.statusCode === "number" && err.statusCode < 500) {
      req.log.warn({ err }, "unmapped 4xx error");
      return reply.code(err.statusCode).send({
        error: {
          code: "bad_request",
          message: GENERIC_4XX_MESSAGES[err.statusCode] ?? "Bad request",
        },
      });
    }
    req.log.error({ err }, "unhandled error");
    return reply.code(500).send({
      error: { code: "internal_error", message: "Internal server error" },
    });
  });

  await app.register(sensible);

  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "OurTeamManagement API",
        description: apiDescription,
        version: "0.0.1",
      },
      servers: [
        {
          url: env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`,
          description: env.PUBLIC_API_URL ? env.NODE_ENV : "local",
        },
      ],
      tags: [
        { name: "Me", description: "The currently authenticated end user." },
        { name: "Orgs", description: "Tenant orgs. Root master, partner, and end-user creation; root master + partner read (partners see only their own orgs)." },
        { name: "Partners", description: "External SaaS integrators. Each partner provisions HR orgs for their own customers and is RLS-isolated from every other partner. Operator-only management." },
        { name: "Members", description: "Per-org memberships and roles." },
        { name: "Invitations", description: "Invite-by-email flow for adding members." },
        { name: "ApiKeys", description: "Tenant-scoped API keys minted from the dashboard." },
        { name: "Employees", description: "Employee records scoped to a tenant org." },
        { name: "TimeOff", description: "Time-off requests with simple approve/reject flow." },
        { name: "Documents", description: "Document metadata (contracts, policies). Externally-hosted blobs in v1." },
        { name: "Reviews", description: "Performance reviews with draft → published lifecycle." },
        { name: "OrgChart", description: "Hierarchy auto-derived from employee manager relationships." },
        { name: "Company", description: "Singleton company profile (legal name, address, branding)." },
        { name: "Settings", description: "Singleton org-level settings (locale, timezone, fiscal year)." },
        { name: "Billing", description: "Read-only snapshot of plan and seat usage." },
        { name: "SuperAdmin", description: "Cross-tenant ops for OurTeamManagement staff (`is_super_admin` users)." },
        { name: "Health", description: "Liveness and service metadata." },
      ],
      components: {
        securitySchemes: {
          masterApiKey: {
            type: "http",
            scheme: "bearer",
            description:
              "Root master API key (env `MASTER_API_KEY`) — the operator's bootstrap credential. Sent as `Authorization: Bearer mh_live_…`. Cross-everything; only credential able to create or revoke partners. Master callers must send `X-Tenant-Id` to scope tenant-specific calls.",
          },
          partnerApiKey: {
            type: "http",
            scheme: "bearer",
            description:
              "Partner API key minted by the operator. Sent as `Authorization: Bearer mh_live_…`. Authenticates as a Partner; cross-tenant within the orgs the owning Partner provisioned (RLS-isolated from every other Partner). Send `X-Tenant-Id` to scope tenant-specific calls; `X-Actor` honored for audit attribution.",
          },
          tenantApiKey: {
            type: "http",
            scheme: "bearer",
            description:
              "Org-scoped API key minted from the dashboard. Sent as `Authorization: Bearer mh_live_…`. The org id is derived from the key, so `X-Tenant-Id` is ignored.",
          },
          userSession: {
            type: "http",
            scheme: "bearer",
            description:
              "Access token (JWT) issued by the external auth service (proark1/auth) and forwarded by the web app. End-user callers send `X-Org-Id` to select which of their orgs the request targets. `X-Actor` is ignored on user-session requests (the actor is taken from the session to prevent spoofing).",
          },
        },
      },
      // Default security: any of the four schemes is acceptable. Routes
      // narrow this via the `onRoute` hook below based on `config.allowedCallers`.
      security: [
        { masterApiKey: [] },
        { partnerApiKey: [] },
        { tenantApiKey: [] },
        { userSession: [] },
      ],
    },
    transform: jsonSchemaTransform,
  });

  // Per-operation security derived from each route's `config.allowedCallers`.
  // The auth/tenant plugins are the source of truth at runtime; this hook
  // mirrors that into the spec so integrators see exactly which credential
  // types each endpoint accepts.
  type CallerType = "master" | "partner" | "tenant_key" | "user";
  const SCHEME_BY_CALLER: Record<CallerType, Record<string, string[]>> = {
    master: { masterApiKey: [] },
    partner: { partnerApiKey: [] },
    tenant_key: { tenantApiKey: [] },
    user: { userSession: [] },
  };
  const ALL_CALLERS: ReadonlyArray<CallerType> = ["master", "partner", "tenant_key", "user"];
  app.addHook("onRoute", (route) => {
    if (!route.schema) return;
    if (route.url.startsWith("/openapi") || route.url === "/healthz" || route.url === "/") {
      (route.schema as Record<string, unknown>).security = [];
      return;
    }
    const cfg = (route.config ?? {}) as {
      allowedCallers?: ReadonlyArray<CallerType>;
      masterOnly?: boolean;
    };
    const allowed: ReadonlyArray<CallerType> =
      cfg.allowedCallers ?? (cfg.masterOnly ? ["master"] : ALL_CALLERS);
    (route.schema as Record<string, unknown>).security = allowed.map(
      (c) => SCHEME_BY_CALLER[c],
    );
  });

  await app.register(swaggerUi, {
    routePrefix: "/openapi",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);
  await app.register(tenantPlugin);
  await app.register(idempotencyPlugin);
  await app.register(auditPlugin);
  await app.register(webhooksPlugin);

  await app.register(healthRoutes);
  await app.register(meRoutes, { prefix: "/v1/me" });
  await app.register(orgRoutes, { prefix: "/v1/orgs" });
  await app.register(partnerRoutes, { prefix: "/v1/partners" });
  await app.register(memberRoutes, { prefix: "/v1/members" });
  await app.register(invitationRoutes, { prefix: "/v1/invitations" });
  await app.register(invitationAcceptRoutes, { prefix: "/v1/invitations" });
  await app.register(apiKeyRoutes, { prefix: "/v1/api-keys" });
  await app.register(employeeRoutes, { prefix: "/v1/employees" });
  await app.register(webhookEndpointRoutes, { prefix: "/v1/webhook-endpoints" });
  await app.register(webhookDeliveryRoutes, { prefix: "/v1/webhook-deliveries" });
  await app.register(timeOffRoutes, { prefix: "/v1/time-off" });
  await app.register(documentRoutes, { prefix: "/v1/documents" });
  await app.register(reviewRoutes, { prefix: "/v1/reviews" });
  await app.register(companyRoutes, { prefix: "/v1/company" });
  await app.register(settingsRoutes, { prefix: "/v1/settings" });
  await app.register(billingRoutes, { prefix: "/v1/billing" });
  await app.register(orgChartRoutes, { prefix: "/v1/org-chart" });
  await app.register(superAdminRoutes, { prefix: "/v1/superadmin" });

  return app;
}
