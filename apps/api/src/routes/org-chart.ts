import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { OrgChart, type OrgChartNode } from "@myhr/types";
import { withTenant } from "@myhr/db";
import { errorResponses, orgReadHeaders } from "../lib/openapi.js";

type Row = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  managerId: string | null;
};

/** Build a forest from a flat employee list. An employee whose managerId is
 *  null OR points to an employee that's not present (e.g. terminated and
 *  excluded) is treated as a root so it doesn't get hidden. */
function buildForest(rows: ReadonlyArray<Row>): OrgChartNode[] {
  const byId = new Map<string, OrgChartNode>();
  for (const r of rows) {
    byId.set(r.id, { ...r, reports: [] });
  }
  const roots: OrgChartNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    const parent = r.managerId ? byId.get(r.managerId) : null;
    if (parent) parent.reports.push(node);
    else roots.push(node);
  }
  // Sort each tier alphabetically for a stable render.
  const sortRecursive = (nodes: OrgChartNode[]) => {
    nodes.sort((a, b) =>
      a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
    );
    for (const n of nodes) sortRecursive(n.reports);
  };
  sortRecursive(roots);
  return roots;
}

const orgChartRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "",
    {
      schema: {
        tags: ["OrgChart"],
        operationId: "getOrgChart",
        summary: "Get org chart",
        description:
          "Hierarchy of active employees, derived from manager relationships. Roots are employees with no manager (or whose manager is no longer active).",
        headers: orgReadHeaders,
        response: { 200: OrgChart, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const rows = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        (tx) =>
          tx.employee.findMany({
            where: {
              orgId: req.tenantId!,
              deletedAt: null,
              status: { not: "terminated" },
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              jobTitle: true,
              department: true,
              managerId: true,
            },
          }),
      );
      req.auditAction = "org_chart.read";
      return { roots: buildForest(rows), total: rows.length };
    },
  );
};

export default orgChartRoutes;
