import { z } from "zod";

export const OrgSettings = z.object({
  orgId: z.string().uuid(),
  defaultCountry: z.string().nullable(),
  weekStartsOn: z.number().int().min(0).max(6),
  dateFormat: z.string(),
  timezone: z.string(),
  locale: z.string(),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type OrgSettings = z.infer<typeof OrgSettings>;

export const OrgSettingsUpdate = z.object({
  defaultCountry: z.string().length(2).nullable().optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  dateFormat: z.string().min(1).max(40).optional(),
  timezone: z.string().min(1).max(80).optional(),
  locale: z.string().min(2).max(20).optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
});
export type OrgSettingsUpdate = z.infer<typeof OrgSettingsUpdate>;
