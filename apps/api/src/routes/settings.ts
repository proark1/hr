import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { OrgSettings, OrgSettingsUpdate } from "@myhr/types";
import { withTenant } from "@myhr/db";
import { errorResponses, orgReadHeaders, orgWriteHeaders } from "../lib/openapi.js";

type Row = {
  orgId: string;
  defaultCountry: string | null;
  weekStartsOn: number;
  dateFormat: string;
  timezone: string;
  locale: string;
  fiscalYearStartMonth: number;
  createdAt: Date;
  updatedAt: Date;
};

function serialize(s: Row) {
  return {
    orgId: s.orgId,
    defaultCountry: s.defaultCountry,
    weekStartsOn: s.weekStartsOn,
    dateFormat: s.dateFormat,
    timezone: s.timezone,
    locale: s.locale,
    fiscalYearStartMonth: s.fiscalYearStartMonth,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

const settingsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "",
    {
      schema: {
        tags: ["Settings"],
        operationId: "getOrgSettings",
        summary: "Get org settings",
        description: "Returns the singleton settings row for this tenant, creating defaults on first read.",
        headers: orgReadHeaders,
        response: { 200: OrgSettings, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: { requireTenant: true },
    },
    async (req) => {
      const s = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) =>
          tx.orgSettings.upsert({
            where: { orgId: req.tenantId! },
            create: { orgId: req.tenantId! },
            update: {},
          }),
      );
      req.auditAction = "settings.read";
      return serialize(s);
    },
  );

  app.put(
    "",
    {
      schema: {
        tags: ["Settings"],
        operationId: "updateOrgSettings",
        summary: "Update org settings",
        headers: orgWriteHeaders,
        body: OrgSettingsUpdate,
        response: { 200: OrgSettings, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: { requireTenant: true, requireMembership: { roles: ["owner", "admin"] } },
    },
    async (req) => {
      const b = req.body;
      const data: Record<string, unknown> = {};
      for (const k of [
        "defaultCountry",
        "weekStartsOn",
        "dateFormat",
        "timezone",
        "locale",
        "fiscalYearStartMonth",
      ] as const) {
        if (b[k] !== undefined) data[k] = b[k];
      }
      const updated = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) =>
          tx.orgSettings.upsert({
            where: { orgId: req.tenantId! },
            create: { orgId: req.tenantId!, ...data },
            update: data,
          }),
      );
      req.auditAction = "settings.updated";
      return serialize(updated);
    },
  );
};

export default settingsRoutes;
