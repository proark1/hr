import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { CompanyProfile, CompanyProfileUpdate } from "@myhr/types";
import { withTenant } from "@myhr/db";
import { errorResponses, orgReadHeaders, orgWriteHeaders } from "../lib/openapi.js";

type Row = {
  orgId: string;
  legalName: string | null;
  displayName: string | null;
  taxId: string | null;
  websiteUrl: string | null;
  supportEmail: string | null;
  logoUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function serialize(p: Row) {
  return {
    orgId: p.orgId,
    legalName: p.legalName,
    displayName: p.displayName,
    taxId: p.taxId,
    websiteUrl: p.websiteUrl,
    supportEmail: p.supportEmail,
    logoUrl: p.logoUrl,
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city: p.city,
    region: p.region,
    postalCode: p.postalCode,
    country: p.country,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

const companyRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET returns the profile, auto-creating an empty row on first read so
  // the resource always exists for this tenant. Idempotent.
  app.get(
    "",
    {
      schema: {
        tags: ["Company"],
        operationId: "getCompanyProfile",
        summary: "Get company profile",
        description: "Returns the singleton company profile for this tenant.",
        headers: orgReadHeaders,
        response: { 200: CompanyProfile, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const p = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) =>
          tx.companyProfile.upsert({
            where: { orgId: req.tenantId! },
            create: { orgId: req.tenantId! },
            update: {},
          }),
      );
      req.auditAction = "company.read";
      return serialize(p);
    },
  );

  app.put(
    "",
    {
      schema: {
        tags: ["Company"],
        operationId: "updateCompanyProfile",
        summary: "Update company profile",
        description: "Upserts the singleton company profile for this tenant. Only provided fields are changed.",
        headers: orgWriteHeaders,
        body: CompanyProfileUpdate,
        response: { 200: CompanyProfile, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: { requireTenant: true, requireMembership: { roles: ["owner", "admin"] } },
    },
    async (req) => {
      const b = req.body;
      const data: Record<string, unknown> = {};
      for (const k of [
        "legalName",
        "displayName",
        "taxId",
        "websiteUrl",
        "supportEmail",
        "logoUrl",
        "addressLine1",
        "addressLine2",
        "city",
        "region",
        "postalCode",
        "country",
      ] as const) {
        if (b[k] !== undefined) data[k] = b[k];
      }

      const updated = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) =>
          tx.companyProfile.upsert({
            where: { orgId: req.tenantId! },
            create: { orgId: req.tenantId!, ...data },
            update: data,
          }),
      );
      req.auditAction = "company.updated";
      return serialize(updated);
    },
  );
};

export default companyRoutes;
