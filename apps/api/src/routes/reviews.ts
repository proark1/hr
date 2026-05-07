import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  PerformanceReview,
  PerformanceReviewCreate,
  PerformanceReviewUpdate,
  PerformanceReviewListQuery,
} from "@myhr/types";
import { withTenant } from "@myhr/db";
import { Errors } from "../errors.js";
import { errorResponses, orgReadHeaders, orgWriteHeaders } from "../lib/openapi.js";

const ListResponse = z.object({
  items: z.array(PerformanceReview),
  nextCursor: z.string().nullable(),
});

type Row = {
  id: string;
  orgId: string;
  employeeId: string;
  reviewerId: string;
  periodStart: Date;
  periodEnd: Date;
  status: "draft" | "published" | "acknowledged";
  rating: number | null;
  summary: string | null;
  strengths: string | null;
  growthAreas: string | null;
  goals: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function serialize(r: Row) {
  return {
    id: r.id,
    orgId: r.orgId,
    employeeId: r.employeeId,
    reviewerId: r.reviewerId,
    periodStart: r.periodStart.toISOString().slice(0, 10),
    periodEnd: r.periodEnd.toISOString().slice(0, 10),
    status: r.status,
    rating: r.rating,
    summary: r.summary,
    strengths: r.strengths,
    growthAreas: r.growthAreas,
    goals: r.goals,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const reviewRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "",
    {
      schema: {
        tags: ["Reviews"],
        operationId: "listReviews",
        summary: "List performance reviews",
        headers: orgReadHeaders,
        querystring: PerformanceReviewListQuery,
        response: { 200: ListResponse, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const { cursor, limit, employeeId, status } = req.query;
      const items = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        (tx) =>
          tx.performanceReview.findMany({
            where: {
              orgId: req.tenantId!,
              ...(employeeId ? { employeeId } : {}),
              ...(status ? { status } : {}),
            },
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            orderBy: { createdAt: "desc" },
          }),
      );
      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, -1) : items;
      req.auditAction = "review.list";
      return {
        items: page.map(serialize),
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      };
    },
  );

  app.post(
    "",
    {
      schema: {
        tags: ["Reviews"],
        operationId: "createReview",
        summary: "Create review (draft)",
        description: "Creates a draft review. Use PATCH /:id { status: 'published' } to publish.",
        headers: orgWriteHeaders,
        body: PerformanceReviewCreate,
        response: { 201: PerformanceReview, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req, reply) => {
      const created = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) => {
          const emp = await tx.employee.findFirst({
            where: { id: req.body.employeeId, orgId: req.tenantId!, deletedAt: null },
            select: { id: true },
          });
          if (!emp) throw Errors.badRequest("employeeId does not reference an employee in this tenant");
          return tx.performanceReview.create({
            data: {
              orgId: req.tenantId!,
              employeeId: req.body.employeeId,
              reviewerId: req.body.reviewerId,
              periodStart: new Date(req.body.periodStart),
              periodEnd: new Date(req.body.periodEnd),
              ...(req.body.rating !== undefined ? { rating: req.body.rating } : {}),
              ...(req.body.summary !== undefined ? { summary: req.body.summary } : {}),
              ...(req.body.strengths !== undefined ? { strengths: req.body.strengths } : {}),
              ...(req.body.growthAreas !== undefined ? { growthAreas: req.body.growthAreas } : {}),
              ...(req.body.goals !== undefined ? { goals: req.body.goals } : {}),
            },
          });
        },
      );
      req.auditAction = "review.created";
      req.auditResource = `review:${created.id}`;
      reply.code(201);
      return serialize(created);
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        tags: ["Reviews"],
        operationId: "getReview",
        summary: "Get review",
        headers: orgReadHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: { 200: PerformanceReview, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const r = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        (tx) =>
          tx.performanceReview.findFirst({
            where: { id: req.params.id, orgId: req.tenantId! },
          }),
      );
      if (!r) throw Errors.notFound();
      req.auditAction = "review.read";
      req.auditResource = `review:${r.id}`;
      return serialize(r);
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        tags: ["Reviews"],
        operationId: "updateReview",
        summary: "Update review",
        description: "Setting `status: 'published'` stamps `publishedAt`.",
        headers: orgWriteHeaders,
        params: z.object({ id: z.string().uuid() }),
        body: PerformanceReviewUpdate,
        response: { 200: PerformanceReview, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const data: Record<string, unknown> = {};
      const b = req.body;
      if (b.rating !== undefined) data.rating = b.rating;
      if (b.summary !== undefined) data.summary = b.summary;
      if (b.strengths !== undefined) data.strengths = b.strengths;
      if (b.growthAreas !== undefined) data.growthAreas = b.growthAreas;
      if (b.goals !== undefined) data.goals = b.goals;
      if (b.status !== undefined) {
        data.status = b.status;
        if (b.status === "published") data.publishedAt = new Date();
      }

      const updated = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) => {
          const existing = await tx.performanceReview.findFirst({
            where: { id: req.params.id, orgId: req.tenantId! },
          });
          if (!existing) throw Errors.notFound();
          return tx.performanceReview.update({ where: { id: existing.id }, data });
        },
      );
      req.auditAction = "review.updated";
      req.auditResource = `review:${updated.id}`;
      return serialize(updated);
    },
  );
};

export default reviewRoutes;
