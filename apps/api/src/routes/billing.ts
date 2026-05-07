import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { BillingSnapshot } from "@myhr/types";
import { withTenant } from "@myhr/db";
import { Errors } from "../errors.js";
import { errorResponses, orgReadHeaders } from "../lib/openapi.js";

const billingRoutes: FastifyPluginAsyncZod = async (app) => {
  // Read-only snapshot. Real Stripe integration (checkout, plan changes,
  // invoice history) is gated behind a future PR — for now we expose the
  // columns already on `orgs` plus a live seat count.
  app.get(
    "",
    {
      schema: {
        tags: ["Billing"],
        operationId: "getBillingSnapshot",
        summary: "Get billing snapshot",
        description:
          "Returns a read-only snapshot of the org's billing state (plan, mode, Stripe ids) plus the current active-employee count.",
        headers: orgReadHeaders,
        response: { 200: BillingSnapshot, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: { requireTenant: true, requireMembership: { roles: ["owner", "admin"] } },
    },
    async (req) => {
      const out = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) => {
          const org = await tx.org.findFirst({
            where: { id: req.tenantId! },
            select: {
              id: true,
              plan: true,
              billingMode: true,
              stripeCustomerId: true,
              stripeSubscriptionId: true,
            },
          });
          if (!org) throw Errors.notFound();
          const used = await tx.employee.count({
            where: { orgId: req.tenantId!, deletedAt: null },
          });
          return { org, used };
        },
      );
      req.auditAction = "billing.read";
      return {
        orgId: out.org.id,
        plan: out.org.plan,
        billingMode: out.org.billingMode,
        stripeCustomerId: out.org.stripeCustomerId,
        stripeSubscriptionId: out.org.stripeSubscriptionId,
        seats: { used: out.used },
      };
    },
  );
};

export default billingRoutes;
