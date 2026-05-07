import { z } from "zod";

/** A single node in the org chart. `reports` is a recursive list of direct
 *  reports (already nested — no client-side stitching needed). */
const OrgChartNodeBase = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  jobTitle: z.string().nullable(),
  department: z.string().nullable(),
  managerId: z.string().uuid().nullable(),
});

export type OrgChartNode = z.infer<typeof OrgChartNodeBase> & {
  reports: OrgChartNode[];
};

export const OrgChartNode: z.ZodType<OrgChartNode> = OrgChartNodeBase.extend({
  reports: z.lazy(() => z.array(OrgChartNode)),
});

export const OrgChart = z.object({
  /** Top-level employees (no manager, or manager is outside this tenant). */
  roots: z.array(OrgChartNode),
  /** Total active employees included in the chart. */
  total: z.number().int().min(0),
});
export type OrgChart = z.infer<typeof OrgChart>;
