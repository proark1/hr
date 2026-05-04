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
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import tenantPlugin from "./plugins/tenant.js";
import idempotencyPlugin from "./plugins/idempotency.js";
import auditPlugin from "./plugins/audit.js";

import healthRoutes from "./routes/health.js";
import orgRoutes from "./routes/orgs.js";
import employeeRoutes from "./routes/employees.js";

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
      openapi: "3.1.0",
      info: {
        title: "MyHR API",
        description:
          "API-first HR service for 1tap.ai. One master integrator provisions and operates many startup tenants.",
        version: "0.0.1",
      },
      servers: [
        {
          url: env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`,
          description: env.PUBLIC_API_URL ? env.NODE_ENV : "local",
        },
      ],
      tags: [
        { name: "Employees", description: "Employee records scoped to a tenant org." },
        { name: "Orgs", description: "Tenant orgs. Master-only endpoints used by 1tap to provision startups." },
        { name: "Health", description: "Liveness and service metadata." },
      ],
      components: {
        securitySchemes: {
          masterApiKey: {
            type: "http",
            scheme: "bearer",
            description: "Master API key issued to 1tap. Sent as `Authorization: Bearer <key>`.",
          },
        },
      },
      security: [{ masterApiKey: [] }],
    },
    transform: jsonSchemaTransform,
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
  await app.register(orgRoutes, { prefix: "/v1/orgs" });
  await app.register(employeeRoutes, { prefix: "/v1/employees" });

  return app;
}
