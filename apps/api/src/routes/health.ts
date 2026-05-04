import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponses } from "../lib/openapi.js";

const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/healthz",
    {
      schema: {
        tags: ["Health"],
        operationId: "healthCheck",
        summary: "Liveness + DB readiness probe",
        description: "Returns ok when the database is reachable.",
        security: [],
        response: { 200: z.object({ ok: z.boolean() }), ...errorResponses(500) },
      },
    },
    async () => {
      await app.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    },
  );

  app.get(
    "/",
    {
      schema: {
        tags: ["Health"],
        operationId: "root",
        summary: "Service banner",
        security: [],
        response: {
          200: z.object({
            name: z.string(),
            version: z.string(),
            docs: z.string().url(),
          }),
        },
      },
    },
    async () => ({
      name: "MyHR API",
      version: "0.0.1",
      docs: "https://github.com/proark1/hr",
    }),
  );
};

export default healthRoutes;
