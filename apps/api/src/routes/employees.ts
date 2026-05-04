import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  Employee,
  EmployeeCreate,
  EmployeeUpdate,
  EmployeeListQuery,
} from "@myhr/types";
import { withTenant } from "@myhr/db";
import { Errors } from "../errors.js";

const ListResponse = z.object({
  items: z.array(Employee),
  nextCursor: z.string().nullable(),
});

const ExportResponse = z.object({
  employee: Employee,
  exportedAt: z.string().datetime(),
});

const employeeRoutes: FastifyPluginAsyncZod = async (app) => {
  // List employees in the current tenant.
  app.get(
    "/",
    {
      schema: {
        querystring: EmployeeListQuery,
        response: { 200: ListResponse },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const { cursor, limit, status, managerId, country } = req.query;
      const items = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: true },
        (tx) =>
          tx.employee.findMany({
            where: {
              orgId: req.tenantId!,
              deletedAt: null,
              ...(status ? { status } : {}),
              ...(managerId ? { managerId } : {}),
              ...(country ? { country } : {}),
            },
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            orderBy: { createdAt: "desc" },
          }),
      );
      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, -1) : items;
      req.auditAction = "employee.list";
      return {
        items: page.map(serializeEmployee),
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      };
    },
  );

  // Create employee.
  app.post(
    "/",
    {
      schema: {
        body: EmployeeCreate,
        response: { 201: Employee },
      },
      config: { requireTenant: true },
    },
    async (req, reply) => {
      const created = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: true },
        (tx) =>
          tx.employee.create({
            data: {
              orgId: req.tenantId!,
              email: req.body.email,
              firstName: req.body.firstName,
              lastName: req.body.lastName,
              country: req.body.country,
              startDate: new Date(req.body.startDate),
              ...(req.body.externalId ? { externalId: req.body.externalId } : {}),
              ...(req.body.preferredName ? { preferredName: req.body.preferredName } : {}),
              ...(req.body.jobTitle ? { jobTitle: req.body.jobTitle } : {}),
              ...(req.body.department ? { department: req.body.department } : {}),
              ...(req.body.managerId ? { managerId: req.body.managerId } : {}),
              ...(req.body.endDate ? { endDate: new Date(req.body.endDate) } : {}),
              ...(req.body.status ? { status: req.body.status } : {}),
            },
          }),
      ).catch((err: unknown) => {
        if (
          typeof err === "object" &&
          err &&
          "code" in err &&
          (err as { code: string }).code === "P2002"
        ) {
          throw Errors.conflict("An employee with that email or external_id already exists");
        }
        throw err;
      });
      req.auditAction = "employee.created";
      req.auditResource = `employee:${created.id}`;
      reply.code(201);
      return serializeEmployee(created);
    },
  );

  // Get one employee.
  app.get(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: Employee },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const e = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: true },
        (tx) =>
          tx.employee.findFirst({
            where: { id: req.params.id, orgId: req.tenantId!, deletedAt: null },
          }),
      );
      if (!e) throw Errors.notFound();
      req.auditAction = "employee.read";
      req.auditResource = `employee:${e.id}`;
      return serializeEmployee(e);
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: EmployeeUpdate,
        response: { 200: Employee },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const data: Record<string, unknown> = {};
      const b = req.body;
      if (b.email !== undefined) data.email = b.email;
      if (b.firstName !== undefined) data.firstName = b.firstName;
      if (b.lastName !== undefined) data.lastName = b.lastName;
      if (b.preferredName !== undefined) data.preferredName = b.preferredName;
      if (b.jobTitle !== undefined) data.jobTitle = b.jobTitle;
      if (b.department !== undefined) data.department = b.department;
      if (b.managerId !== undefined) data.managerId = b.managerId;
      if (b.country !== undefined) data.country = b.country;
      if (b.startDate !== undefined) data.startDate = new Date(b.startDate);
      if (b.endDate !== undefined) data.endDate = b.endDate ? new Date(b.endDate) : null;
      if (b.status !== undefined) data.status = b.status;
      if (b.externalId !== undefined) data.externalId = b.externalId;

      const updated = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: true },
        async (tx) => {
          const existing = await tx.employee.findFirst({
            where: { id: req.params.id, orgId: req.tenantId!, deletedAt: null },
          });
          if (!existing) throw Errors.notFound();
          return tx.employee.update({ where: { id: existing.id }, data });
        },
      );
      req.auditAction = "employee.updated";
      req.auditResource = `employee:${updated.id}`;
      return serializeEmployee(updated);
    },
  );

  // GDPR Art. 17 — soft-delete then schedule erasure.
  // For now we soft-delete and anonymize PII in place. A scheduled job will
  // perform hard erasure once retention deadlines pass (DE: 6–10y for some
  // payroll-adjacent records — handled in a later PR).
  app.delete(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            id: z.string().uuid(),
            deletedAt: z.string().datetime(),
          }),
        },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const out = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: true },
        async (tx) => {
          const existing = await tx.employee.findFirst({
            where: { id: req.params.id, orgId: req.tenantId!, deletedAt: null },
          });
          if (!existing) throw Errors.notFound();
          return tx.employee.update({
            where: { id: existing.id },
            data: {
              deletedAt: new Date(),
              email: `deleted+${existing.id}@redacted.invalid`,
              firstName: "Redacted",
              lastName: "Redacted",
              preferredName: null,
              sensitive: null,
            },
          });
        },
      );
      req.auditAction = "employee.deleted";
      req.auditResource = `employee:${out.id}`;
      return { id: out.id, deletedAt: out.deletedAt!.toISOString() };
    },
  );

  // GDPR Art. 15 — right to access. Returns the employee record. In a follow-up
  // PR this will also bundle contracts + documents into a zip.
  app.get(
    "/:id/export",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: ExportResponse },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const e = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: true },
        (tx) =>
          tx.employee.findFirst({
            where: { id: req.params.id, orgId: req.tenantId! },
          }),
      );
      if (!e) throw Errors.notFound();
      req.auditAction = "employee.exported";
      req.auditResource = `employee:${e.id}`;
      return {
        employee: serializeEmployee(e),
        exportedAt: new Date().toISOString(),
      };
    },
  );
};

export default employeeRoutes;

type EmployeeRow = {
  id: string;
  orgId: string;
  externalId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  jobTitle: string | null;
  department: string | null;
  managerId: string | null;
  country: "us" | "de";
  startDate: Date;
  endDate: Date | null;
  status: "onboarding" | "active" | "on_leave" | "terminated";
  createdAt: Date;
  updatedAt: Date;
};

function serializeEmployee(e: EmployeeRow) {
  return {
    id: e.id,
    orgId: e.orgId,
    externalId: e.externalId,
    email: e.email,
    firstName: e.firstName,
    lastName: e.lastName,
    preferredName: e.preferredName,
    jobTitle: e.jobTitle,
    department: e.department,
    managerId: e.managerId,
    country: e.country,
    startDate: e.startDate.toISOString().slice(0, 10),
    endDate: e.endDate ? e.endDate.toISOString().slice(0, 10) : null,
    status: e.status,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
