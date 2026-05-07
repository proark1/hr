import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  Document as DocumentSchema,
  DocumentCreate,
  DocumentUpdate,
  DocumentListQuery,
} from "@myhr/types";
import { withTenant } from "@myhr/db";
import { Errors } from "../errors.js";
import { errorResponses, orgReadHeaders, orgWriteHeaders } from "../lib/openapi.js";

const ListResponse = z.object({
  items: z.array(DocumentSchema),
  nextCursor: z.string().nullable(),
});

type Row = {
  id: string;
  orgId: string;
  employeeId: string | null;
  name: string;
  type: "contract" | "offer_letter" | "id_document" | "policy" | "certificate" | "other";
  fileUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  expiresAt: Date | null;
  notes: string | null;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function serialize(d: Row) {
  return {
    id: d.id,
    orgId: d.orgId,
    employeeId: d.employeeId,
    name: d.name,
    type: d.type,
    fileUrl: d.fileUrl,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
    notes: d.notes,
    uploadedBy: d.uploadedBy,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function actorIdFor(req: { caller: unknown; actor: { id?: string } | undefined }): string | null {
  const caller = req.caller as { type: string; userId?: string };
  if (caller?.type === "user" && caller.userId) return caller.userId;
  return req.actor?.id ?? null;
}

const documentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "",
    {
      schema: {
        tags: ["Documents"],
        operationId: "listDocuments",
        summary: "List documents",
        headers: orgReadHeaders,
        querystring: DocumentListQuery,
        response: { 200: ListResponse, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const { cursor, limit, employeeId, type } = req.query;
      const items = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        (tx) =>
          tx.document.findMany({
            where: {
              orgId: req.tenantId!,
              deletedAt: null,
              ...(employeeId ? { employeeId } : {}),
              ...(type ? { type } : {}),
            },
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            orderBy: { createdAt: "desc" },
          }),
      );
      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, -1) : items;
      req.auditAction = "document.list";
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
        tags: ["Documents"],
        operationId: "createDocument",
        summary: "Create document",
        description:
          "Registers a document. We don't host blobs in this MVP — pass `fileUrl` to a pre-uploaded location (e.g. S3, Drive).",
        headers: orgWriteHeaders,
        body: DocumentCreate,
        response: { 201: DocumentSchema, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req, reply) => {
      const created = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) => {
          if (req.body.employeeId) {
            const emp = await tx.employee.findFirst({
              where: { id: req.body.employeeId, orgId: req.tenantId!, deletedAt: null },
              select: { id: true },
            });
            if (!emp) throw Errors.badRequest("employeeId does not reference an employee in this tenant");
          }
          return tx.document.create({
            data: {
              orgId: req.tenantId!,
              ...(req.body.employeeId ? { employeeId: req.body.employeeId } : {}),
              name: req.body.name,
              type: req.body.type ?? "other",
              ...(req.body.fileUrl ? { fileUrl: req.body.fileUrl } : {}),
              ...(req.body.mimeType ? { mimeType: req.body.mimeType } : {}),
              ...(req.body.sizeBytes !== undefined ? { sizeBytes: req.body.sizeBytes } : {}),
              ...(req.body.expiresAt ? { expiresAt: new Date(req.body.expiresAt) } : {}),
              ...(req.body.notes ? { notes: req.body.notes } : {}),
              uploadedBy: actorIdFor(req),
            },
          });
        },
      );
      req.auditAction = "document.created";
      req.auditResource = `document:${created.id}`;
      reply.code(201);
      return serialize(created);
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        tags: ["Documents"],
        operationId: "getDocument",
        summary: "Get document",
        headers: orgReadHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: { 200: DocumentSchema, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const d = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        (tx) =>
          tx.document.findFirst({
            where: { id: req.params.id, orgId: req.tenantId!, deletedAt: null },
          }),
      );
      if (!d) throw Errors.notFound();
      req.auditAction = "document.read";
      req.auditResource = `document:${d.id}`;
      return serialize(d);
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        tags: ["Documents"],
        operationId: "updateDocument",
        summary: "Update document",
        headers: orgWriteHeaders,
        params: z.object({ id: z.string().uuid() }),
        body: DocumentUpdate,
        response: { 200: DocumentSchema, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const data: Record<string, unknown> = {};
      const b = req.body;
      if (b.employeeId !== undefined) data.employeeId = b.employeeId;
      if (b.name !== undefined) data.name = b.name;
      if (b.type !== undefined) data.type = b.type;
      if (b.fileUrl !== undefined) data.fileUrl = b.fileUrl;
      if (b.mimeType !== undefined) data.mimeType = b.mimeType;
      if (b.sizeBytes !== undefined) data.sizeBytes = b.sizeBytes;
      if (b.expiresAt !== undefined) data.expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
      if (b.notes !== undefined) data.notes = b.notes;

      const updated = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) => {
          const existing = await tx.document.findFirst({
            where: { id: req.params.id, orgId: req.tenantId!, deletedAt: null },
          });
          if (!existing) throw Errors.notFound();
          if (typeof data.employeeId === "string") {
            const emp = await tx.employee.findFirst({
              where: { id: data.employeeId, orgId: req.tenantId!, deletedAt: null },
              select: { id: true },
            });
            if (!emp) throw Errors.badRequest("employeeId does not reference an employee in this tenant");
          }
          return tx.document.update({ where: { id: existing.id }, data });
        },
      );
      req.auditAction = "document.updated";
      req.auditResource = `document:${updated.id}`;
      return serialize(updated);
    },
  );

  app.delete(
    "/:id",
    {
      schema: {
        tags: ["Documents"],
        operationId: "deleteDocument",
        summary: "Delete document (soft)",
        headers: orgWriteHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ id: z.string().uuid(), deletedAt: z.string().datetime() }),
          ...errorResponses(400, 401, 403, 404, 429, 500),
        },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const out = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) => {
          const existing = await tx.document.findFirst({
            where: { id: req.params.id, orgId: req.tenantId!, deletedAt: null },
          });
          if (!existing) throw Errors.notFound();
          return tx.document.update({
            where: { id: existing.id },
            data: { deletedAt: new Date() },
          });
        },
      );
      req.auditAction = "document.deleted";
      req.auditResource = `document:${out.id}`;
      return { id: out.id, deletedAt: out.deletedAt!.toISOString() };
    },
  );
};

export default documentRoutes;
