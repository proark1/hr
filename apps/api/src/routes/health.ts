import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/healthz", async () => {
    await app.prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  });

  app.get("/", async () => ({
    name: "MyHR API",
    version: "0.0.1",
    docs: "https://github.com/proark1/hr",
  }));
};

export default healthRoutes;
