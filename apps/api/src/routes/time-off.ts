import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  TimeOffRequest,
  TimeOffRequestCreate,
  TimeOffDecision,
  TimeOffListQuery,
} from "@myhr/types";
import { withTenant } from "@myhr/db";
import { Errors } from "../errors.js";
import { errorResponses, orgReadHeaders, orgWriteHeaders } from "../lib/openapi.js";

const ListResponse = z.object({
  items: z.array(TimeOffRequest),
  nextCursor: z.string().nullable(),
});

type Row = {
  id: string;
  orgId: string;
  employeeId: string;
  type: "vacation" | "sick" | "personal" | "unpaid" | "parental";
  startDate: Date;
  endDate: Date;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  decisionNote: string | null;
  decidedAt: Date | null;
  decidedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function serialize(r: Row) {
  return {
    id: r.id,
    orgId: r.orgId,
    employeeId: r.employeeId,
    type: r.type,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    status: r.status,
    reason: r.reason,
    decisionNote: r.decisionNote,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    decidedBy: r.decidedBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Best-effort actor id for audit trail on approve/reject. User callers
 *  carry it on the JWT; machine callers may pass it via X-Actor. */
function actorIdFor(req: { caller: unknown; actor: { id?: string } | undefined }): string | null {
  const caller = req.caller as { type: string; userId?: string };
  if (caller?.type === "user" && caller.userId) return caller.userId;
  return req.actor?.id ?? null;
}

const timeOffRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "",
    {
      schema: {
        tags: ["TimeOff"],
        operationId: "listTimeOffRequests",
        summary: "List time-off requests",
        description: "Cursor-paginated list, scoped to the current tenant.",
        headers: orgReadHeaders,
        querystring: TimeOffListQuery,
        response: { 200: ListResponse, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const { cursor, limit, employeeId, status, type } = req.query;
      const items = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        (tx) =>
          tx.timeOffRequest.findMany({
            where: {
              orgId: req.tenantId!,
              ...(employeeId ? { employeeId } : {}),
              ...(status ? { status } : {}),
              ...(type ? { type } : {}),
            },
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            orderBy: { createdAt: "desc" },
          }),
      );
      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, -1) : items;
      req.auditAction = "time_off.list";
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
        tags: ["TimeOff"],
        operationId: "createTimeOffRequest",
        summary: "Create time-off request",
        description: "Files a new time-off request. Starts in `pending` status.",
        headers: orgWriteHeaders,
        body: TimeOffRequestCreate,
        response: { 201: TimeOffRequest, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req, reply) => {
      const created = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) => {
          // RLS scopes this to the tenant; an employee from another org would
          // come back as null here even with master-mode bypass disabled.
          const emp = await tx.employee.findFirst({
            where: { id: req.body.employeeId, orgId: req.tenantId!, deletedAt: null },
            select: { id: true },
          });
          if (!emp) throw Errors.badRequest("employeeId does not reference an employee in this tenant");
          return tx.timeOffRequest.create({
            data: {
              orgId: req.tenantId!,
              employeeId: req.body.employeeId,
              type: req.body.type,
              startDate: new Date(req.body.startDate),
              endDate: new Date(req.body.endDate),
              ...(req.body.reason ? { reason: req.body.reason } : {}),
            },
          });
        },
      );
      req.auditAction = "time_off.created";
      req.auditResource = `time_off:${created.id}`;
      const out = serialize(created);
      reply.code(201);
      return out;
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        tags: ["TimeOff"],
        operationId: "getTimeOffRequest",
        summary: "Get time-off request",
        headers: orgReadHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: { 200: TimeOffRequest, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const r = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        (tx) =>
          tx.timeOffRequest.findFirst({
            where: { id: req.params.id, orgId: req.tenantId! },
          }),
      );
      if (!r) throw Errors.notFound();
      req.auditAction = "time_off.read";
      req.auditResource = `time_off:${r.id}`;
      return serialize(r);
    },
  );

  // Approve / reject / cancel. Required role:
  //   - approved/rejected: owner | admin | manager (managers may sign off
  //     on their team; finer-grained "managed-by-me" filtering can come later).
  //   - cancelled: anyone in the tenant (typically the requester themselves).
  app.post(
    "/:id/decision",
    {
      schema: {
        tags: ["TimeOff"],
        operationId: "decideTimeOffRequest",
        summary: "Approve, reject, or cancel a time-off request",
        description:
          "Approve/reject requires owner, admin, or manager role for user callers. Machine callers (master, tenant_key) always pass.",
        headers: orgWriteHeaders,
        params: z.object({ id: z.string().uuid() }),
        body: TimeOffDecision,
        response: { 200: TimeOffRequest, ...errorResponses(400, 401, 403, 404, 409, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const target = req.body.status;
      if (target !== "cancelled") {
        if (req.caller.type === "user") {
          const role = req.callerRole;
          if (!role || !["owner", "admin", "manager"].includes(role)) {
            throw Errors.forbidden("Only owners, admins, and managers may approve or reject");
          }
        }
      }
      const updated = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) => {
          const existing = await tx.timeOffRequest.findFirst({
            where: { id: req.params.id, orgId: req.tenantId! },
          });
          if (!existing) throw Errors.notFound();
          if (existing.status !== "pending") {
            throw Errors.conflict(`Request is already ${existing.status}`);
          }
          return tx.timeOffRequest.update({
            where: { id: existing.id },
            data: {
              status: target,
              decisionNote: req.body.decisionNote ?? null,
              decidedAt: new Date(),
              decidedBy: actorIdFor(req),
            },
          });
        },
      );
      req.auditAction = `time_off.${target}`;
      req.auditResource = `time_off:${updated.id}`;
      return serialize(updated);
    },
  );
};

export default timeOffRoutes;
