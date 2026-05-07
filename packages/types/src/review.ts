import { z } from "zod";

export const ReviewStatus = z.enum(["draft", "published", "acknowledged"]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const PerformanceReview = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  employeeId: z.string().uuid(),
  reviewerId: z.string(),
  periodStart: IsoDate,
  periodEnd: IsoDate,
  status: ReviewStatus,
  rating: z.number().int().min(1).max(5).nullable(),
  summary: z.string().nullable(),
  strengths: z.string().nullable(),
  growthAreas: z.string().nullable(),
  goals: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PerformanceReview = z.infer<typeof PerformanceReview>;

export const PerformanceReviewCreate = z
  .object({
    employeeId: z.string().uuid(),
    reviewerId: z.string().min(1).max(200),
    periodStart: IsoDate,
    periodEnd: IsoDate,
    rating: z.number().int().min(1).max(5).optional(),
    summary: z.string().max(8000).optional(),
    strengths: z.string().max(8000).optional(),
    growthAreas: z.string().max(8000).optional(),
    goals: z.string().max(8000).optional(),
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: "periodEnd must be on or after periodStart",
    path: ["periodEnd"],
  });
export type PerformanceReviewCreate = z.infer<typeof PerformanceReviewCreate>;

export const PerformanceReviewUpdate = z.object({
  rating: z.number().int().min(1).max(5).nullable().optional(),
  summary: z.string().max(8000).nullable().optional(),
  strengths: z.string().max(8000).nullable().optional(),
  growthAreas: z.string().max(8000).nullable().optional(),
  goals: z.string().max(8000).nullable().optional(),
  status: ReviewStatus.optional(),
});
export type PerformanceReviewUpdate = z.infer<typeof PerformanceReviewUpdate>;

export const PerformanceReviewListQuery = z.object({
  employeeId: z.string().uuid().optional(),
  status: ReviewStatus.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PerformanceReviewListQuery = z.infer<typeof PerformanceReviewListQuery>;
