import { z } from "zod";

export const OrgRegion = z.enum(["eu", "us"]);
export const OrgStatus = z.enum(["active", "suspended", "deleted"]);

export const Org = z.object({
  id: z.string().uuid(),
  name: z.string(),
  region: OrgRegion,
  status: OrgStatus,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Org = z.infer<typeof Org>;

export const OrgCreate = z.object({
  name: z.string().min(1).max(200),
  region: OrgRegion.default("eu"),
});
export type OrgCreate = z.infer<typeof OrgCreate>;

export const OrgUpdate = OrgCreate.partial().extend({
  status: OrgStatus.optional(),
});
export type OrgUpdate = z.infer<typeof OrgUpdate>;
