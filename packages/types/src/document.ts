import { z } from "zod";

export const DocumentType = z.enum([
  "contract",
  "offer_letter",
  "id_document",
  "policy",
  "certificate",
  "other",
]);
export type DocumentType = z.infer<typeof DocumentType>;

export const Document = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  employeeId: z.string().uuid().nullable(),
  name: z.string(),
  type: DocumentType,
  fileUrl: z.string().nullable(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  expiresAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  uploadedBy: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Document = z.infer<typeof Document>;

export const DocumentCreate = z.object({
  employeeId: z.string().uuid().optional(),
  name: z.string().min(1).max(300),
  type: DocumentType.default("other"),
  fileUrl: z.string().url().optional(),
  mimeType: z.string().max(200).optional(),
  sizeBytes: z.number().int().min(0).optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().max(4000).optional(),
});
export type DocumentCreate = z.infer<typeof DocumentCreate>;

export const DocumentUpdate = DocumentCreate.partial();
export type DocumentUpdate = z.infer<typeof DocumentUpdate>;

export const DocumentListQuery = z.object({
  employeeId: z.string().uuid().optional(),
  type: DocumentType.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type DocumentListQuery = z.infer<typeof DocumentListQuery>;
