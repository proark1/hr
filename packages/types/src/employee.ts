import { z } from "zod";

export const EmployeeStatus = z.enum(["onboarding", "active", "on_leave", "terminated"]);
export const EmployeeCountry = z.enum(["us", "de"]);

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const Employee = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  externalId: z.string().nullable(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  preferredName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  department: z.string().nullable(),
  managerId: z.string().uuid().nullable(),
  country: EmployeeCountry,
  startDate: IsoDate,
  endDate: IsoDate.nullable(),
  status: EmployeeStatus,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Employee = z.infer<typeof Employee>;

export const EmployeeCreate = z.object({
  externalId: z.string().min(1).max(200).optional(),
  email: z.string().email(),
  firstName: z.string().min(1).max(200),
  lastName: z.string().min(1).max(200),
  preferredName: z.string().max(200).optional(),
  jobTitle: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
  managerId: z.string().uuid().optional(),
  country: EmployeeCountry,
  startDate: IsoDate,
  endDate: IsoDate.optional(),
  status: EmployeeStatus.default("onboarding"),
});
export type EmployeeCreate = z.infer<typeof EmployeeCreate>;

export const EmployeeUpdate = EmployeeCreate.partial();
export type EmployeeUpdate = z.infer<typeof EmployeeUpdate>;

export const EmployeeListQuery = z.object({
  status: EmployeeStatus.optional(),
  managerId: z.string().uuid().optional(),
  country: EmployeeCountry.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type EmployeeListQuery = z.infer<typeof EmployeeListQuery>;
