import { z } from "zod";

export const TimeOffType = z.enum(["vacation", "sick", "personal", "unpaid", "parental"]);
export type TimeOffType = z.infer<typeof TimeOffType>;

export const TimeOffStatus = z.enum(["pending", "approved", "rejected", "cancelled"]);
export type TimeOffStatus = z.infer<typeof TimeOffStatus>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const TimeOffRequest = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  employeeId: z.string().uuid(),
  type: TimeOffType,
  startDate: IsoDate,
  endDate: IsoDate,
  status: TimeOffStatus,
  reason: z.string().nullable(),
  decisionNote: z.string().nullable(),
  decidedAt: z.string().datetime().nullable(),
  decidedBy: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TimeOffRequest = z.infer<typeof TimeOffRequest>;

export const TimeOffRequestCreate = z
  .object({
    employeeId: z.string().uuid(),
    type: TimeOffType,
    startDate: IsoDate,
    endDate: IsoDate,
    reason: z.string().max(2000).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type TimeOffRequestCreate = z.infer<typeof TimeOffRequestCreate>;

export const TimeOffDecision = z.object({
  status: z.enum(["approved", "rejected", "cancelled"]),
  decisionNote: z.string().max(2000).optional(),
});
export type TimeOffDecision = z.infer<typeof TimeOffDecision>;

export const TimeOffListQuery = z.object({
  employeeId: z.string().uuid().optional(),
  status: TimeOffStatus.optional(),
  type: TimeOffType.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type TimeOffListQuery = z.infer<typeof TimeOffListQuery>;
