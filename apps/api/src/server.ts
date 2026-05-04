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
import { apiDescription } from "./lib/api-description.js";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth/index.js";
import tenantPlugin from "./plugins/tenant.js";
import idempotencyPlugin from "./plugins/idempotency.js";
import auditPlugin from "./plugins/audit.js";

import healthRoutes from "./routes/health.js";
import orgRoutes from "./routes/orgs.js";
import employeeRoutes from "./routes/employees.js";
import meRoutes from "./routes/me.js";
import memberRoutes from "./routes/members.js";
import invitationRoutes, { invitationAcceptRoutes } from "./routes/invitations.js";
import apiKeyRoutes from "./routes/api-keys.js";
import superAdminRoutes from "./routes/superadmin.js";

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
    if ("statusCode" in err && typeof err.statusCode === "number" && err.statusCode < 500) {
      return reply.code(err.statusCode).send({
        error: { code: err.code ?? "bad_request", message: err.message },
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
        title: "MyHR API",
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
        { name: "Orgs", description: "Tenant orgs. Master + end-user creation; master read." },
        { name: "Members", description: "Per-org memberships and roles." },
        { name: "Invitations", description: "Invite-by-email flow for adding members." },
        { name: "ApiKeys", description: "Tenant-scoped API keys minted from the dashboard." },
        { name: "Employees", description: "Employee records scoped to a tenant org." },
        { name: "SuperAdmin", description: "Cross-tenant ops for MyHR staff (`is_super_admin` users)." },
        { name: "Health", description: "Liveness and service metadata." },
      ],
      components: {
        securitySchemes: {
          masterApiKey: {
            type: "http",
            scheme: "bearer",
            description:
              "Master API key issued to 1tap (env `MASTER_API_KEY`). Sent as `Authorization: Bearer mh_live_…`. Master callers may operate across all tenants and must send `X-Tenant-Id` to scope tenant-specific calls.",
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
              "Better Auth session token forwarded by the web app. End-user callers send `X-Org-Id` to select which of their orgs the request targets. `X-Actor` is ignored on user-session requests (the actor is taken from the session to prevent spoofing).",
          },
        },
      },
      // Default security: any of the three schemes is acceptable. Routes
      // narrow this via the `onRoute` hook below based on `config.allowedCallers`.
      security: [{ masterApiKey: [] }, { tenantApiKey: [] }, { userSession: [] }],
    },
    transform: jsonSchemaTransform,
  });

  // Per-operation security derived from each route's `config.allowedCallers`.
  // The auth/tenant plugins are the source of truth at runtime; this hook
  // mirrors that into the spec so integrators see exactly which credential
  // types each endpoint accepts.
  type CallerType = "master" | "tenant_key" | "user";
  const SCHEME_BY_CALLER: Record<CallerType, Record<string, string[]>> = {
    master: { masterApiKey: [] },
    tenant_key: { tenantApiKey: [] },
    user: { userSession: [] },
  };
  const ALL_CALLERS: ReadonlyArray<CallerType> = ["master", "tenant_key", "user"];
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
  await app.register(tenantPlugin);
  await app.register(idempotencyPlugin);
  await app.register(auditPlugin);

  await app.register(healthRoutes);
  await app.register(meRoutes, { prefix: "/v1/me" });
  await app.register(orgRoutes, { prefix: "/v1/orgs" });
  await app.register(memberRoutes, { prefix: "/v1/members" });
  await app.register(invitationRoutes, { prefix: "/v1/invitations" });
  await app.register(invitationAcceptRoutes, { prefix: "/v1/invitations" });
  await app.register(apiKeyRoutes, { prefix: "/v1/api-keys" });
  await app.register(employeeRoutes, { prefix: "/v1/employees" });
  await app.register(superAdminRoutes, { prefix: "/v1/superadmin" });

  return app;
}
