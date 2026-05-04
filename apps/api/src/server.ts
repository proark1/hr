import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";

import { env } from "./env.js";
import { ApiError } from "./errors.js";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth/index.js";
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
