import type {
  Me,
  MyOrg,
  Org,
  OrgCreate,
  OrgUpdate,
  Member,
  Invitation,
  InvitationCreate,
  InvitationCreated,
  Membership,
  ApiKey,
  ApiKeyCreate,
  ApiKeyCreated,
  Partner,
  PartnerCreate,
  PartnerUpdate,
  PartnerKey,
  PartnerKeyCreate,
  PartnerKeyCreated,
  Employee,
  EmployeeCreate,
  EmployeeUpdate,
  EmployeeListQuery,
  WebhookEndpoint,
  WebhookEndpointCreate,
  WebhookEndpointUpdate,
  WebhookEndpointWithSecret,
  WebhookDelivery,
  WebhookDeliveryListQuery,
  TimeOffRequest,
  TimeOffRequestCreate,
  TimeOffDecision,
  TimeOffListQuery,
  Document,
  DocumentCreate,
  DocumentUpdate,
  DocumentListQuery,
  PerformanceReview,
  PerformanceReviewCreate,
  PerformanceReviewUpdate,
  PerformanceReviewListQuery,
  CompanyProfile,
  CompanyProfileUpdate,
  OrgSettings,
  OrgSettingsUpdate,
  BillingSnapshot,
  OrgChart,
} from "@myhr/types";
import { MyHRError, type ApiErrorBody } from "./errors.js";

export type CallerContext = {
  /** Set X-Org-Id for end-user callers. */
  orgId?: string;
  /** Set X-Tenant-Id for master callers. */
  tenantId?: string;
  /** Override the auto-generated Idempotency-Key (writes only). */
  idempotencyKey?: string;
};

export type ClientConfig = {
  baseUrl: string;
  /** Returns the bearer token to send. May be sync or async. */
  getToken: () => string | Promise<string>;
  /** Default org/tenant id applied to every call unless overridden per-method. */
  defaultOrgId?: string;
  defaultTenantId?: string;
  /** Inject a custom fetch (e.g. Next.js server fetch with cache: 'no-store'). */
  fetch?: typeof fetch;
};

type Page<T> = { items: T[]; nextCursor: string | null };

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function qs(obj?: Record<string, string | number | undefined>): string {
  if (!obj) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Build a typed OurTeamManagement client.
 *
 * Auth is pluggable: pass a `getToken` that returns either a master/tenant
 * `mh_live_…` key (machine callers) or an auth-service access token (JWT)
 * (end-user callers). Pass an org context per-call or set defaults at
 * construction.
 */
export function createClient(config: ClientConfig) {
  const fetchFn = config.fetch ?? fetch;

  async function request<T>(
    method: string,
    path: string,
    init: { body?: unknown; ctx?: CallerContext } = {},
  ): Promise<T> {
    const token = await Promise.resolve(config.getToken());
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const orgId = init.ctx?.orgId ?? config.defaultOrgId;
    if (orgId) headers["X-Org-Id"] = orgId;
    const tenantId = init.ctx?.tenantId ?? config.defaultTenantId;
    if (tenantId) headers["X-Tenant-Id"] = tenantId;

    if (WRITE_METHODS.has(method)) {
      headers["Idempotency-Key"] = init.ctx?.idempotencyKey ?? crypto.randomUUID();
    }

    const res = await fetchFn(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      throw new MyHRError(
        res.status,
        body?.error?.code ?? "unknown",
        body?.error?.message ?? res.statusText,
        body?.error?.details,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    /** Authenticated end-user routes. */
    me: {
      get: () => request<Me>("GET", "/v1/me"),
      listMyOrgs: () => request<{ items: MyOrg[] }>("GET", "/v1/me/orgs"),
    },

    /** Tenant orgs. POST accepts root-master, partner, and user callers.
     *  GET / GET-by-id / PATCH accept root-master and partner (partners are
     *  RLS-isolated to the orgs they themselves provisioned). */
    orgs: {
      list: (q?: { cursor?: string; limit?: number }) =>
        request<Page<Org>>("GET", `/v1/orgs${qs(q)}`),
      create: (body: OrgCreate, ctx?: CallerContext) =>
        request<Org>("POST", "/v1/orgs", { body, ctx }),
      get: (id: string, ctx?: CallerContext) =>
        request<Org>("GET", `/v1/orgs/${id}`, { ctx }),
      update: (id: string, body: OrgUpdate, ctx?: CallerContext) =>
        request<Org>("PATCH", `/v1/orgs/${id}`, { body, ctx }),
    },

    /** Partners (operator-only). External SaaS integrators that provision
     *  HR orgs on behalf of their own customers. Each partner is
     *  RLS-isolated from every other partner. */
    partners: {
      create: (body: PartnerCreate, ctx?: CallerContext) =>
        request<Partner>("POST", "/v1/partners", { body, ctx }),
      list: (q?: { cursor?: string; limit?: number }) =>
        request<Page<Partner>>("GET", `/v1/partners${qs(q)}`),
      get: (id: string, ctx?: CallerContext) =>
        request<Partner>("GET", `/v1/partners/${id}`, { ctx }),
      update: (id: string, body: PartnerUpdate, ctx?: CallerContext) =>
        request<Partner>("PATCH", `/v1/partners/${id}`, { body, ctx }),
      keys: {
        create: (partnerId: string, body: PartnerKeyCreate, ctx?: CallerContext) =>
          request<PartnerKeyCreated>(
            "POST",
            `/v1/partners/${partnerId}/keys`,
            { body, ctx },
          ),
        list: (partnerId: string, ctx?: CallerContext) =>
          request<{ items: PartnerKey[] }>(
            "GET",
            `/v1/partners/${partnerId}/keys`,
            { ctx },
          ),
        revoke: (partnerId: string, keyId: string, ctx?: CallerContext) =>
          request<void>(
            "DELETE",
            `/v1/partners/${partnerId}/keys/${keyId}`,
            { ctx },
          ),
      },
    },

    /** Per-org memberships. */
    members: {
      list: (ctx?: CallerContext) =>
        request<{ items: Member[] }>("GET", "/v1/members", { ctx }),
    },

    /** Invite-by-email flow. */
    invitations: {
      create: (body: InvitationCreate, ctx?: CallerContext) =>
        request<InvitationCreated>("POST", "/v1/invitations", { body, ctx }),
      list: (ctx?: CallerContext) =>
        request<{ items: Invitation[] }>("GET", "/v1/invitations", { ctx }),
      accept: (token: string, ctx?: CallerContext) =>
        request<Membership>("POST", "/v1/invitations/accept", { body: { token }, ctx }),
    },

    /** Tenant-scoped API keys. */
    apiKeys: {
      create: (body: ApiKeyCreate, ctx?: CallerContext) =>
        request<ApiKeyCreated>("POST", "/v1/api-keys", { body, ctx }),
      list: (ctx?: CallerContext) =>
        request<{ items: ApiKey[] }>("GET", "/v1/api-keys", { ctx }),
    },

    /** Employees. */
    employees: {
      list: (q?: EmployeeListQuery, ctx?: CallerContext) =>
        request<Page<Employee>>(
          "GET",
          `/v1/employees${qs(q as Record<string, string | number | undefined>)}`,
          { ctx },
        ),
      create: (body: EmployeeCreate, ctx?: CallerContext) =>
        request<Employee>("POST", "/v1/employees", { body, ctx }),
      get: (id: string, ctx?: CallerContext) =>
        request<Employee>("GET", `/v1/employees/${id}`, { ctx }),
      update: (id: string, body: EmployeeUpdate, ctx?: CallerContext) =>
        request<Employee>("PATCH", `/v1/employees/${id}`, { body, ctx }),
      delete: (id: string, ctx?: CallerContext) =>
        request<{ id: string; deletedAt: string }>(
          "DELETE",
          `/v1/employees/${id}`,
          { ctx },
        ),
      exportData: (id: string, ctx?: CallerContext) =>
        request<{ employee: Employee; exportedAt: string }>(
          "GET",
          `/v1/employees/${id}/export`,
          { ctx },
        ),
    },

    /** OurTeamManagement ops humans (`is_super_admin = true`). */
    superadmin: {
      listOrgs: (q?: { cursor?: string; limit?: number }) =>
        request<Page<Org>>("GET", `/v1/superadmin/orgs${qs(q)}`),
    },

    /** Webhook endpoints. */
    webhookEndpoints: {
      create: (body: WebhookEndpointCreate, ctx?: CallerContext) =>
        request<WebhookEndpointWithSecret>("POST", "/v1/webhook-endpoints", {
          body,
          ctx,
        }),
      list: (ctx?: CallerContext) =>
        request<{ items: WebhookEndpoint[] }>("GET", "/v1/webhook-endpoints", {
          ctx,
        }),
      get: (id: string, ctx?: CallerContext) =>
        request<WebhookEndpoint>("GET", `/v1/webhook-endpoints/${id}`, { ctx }),
      update: (id: string, body: WebhookEndpointUpdate, ctx?: CallerContext) =>
        request<WebhookEndpoint>("PATCH", `/v1/webhook-endpoints/${id}`, {
          body,
          ctx,
        }),
      rotateSecret: (id: string, ctx?: CallerContext) =>
        request<WebhookEndpointWithSecret>(
          "POST",
          `/v1/webhook-endpoints/${id}/rotate-secret`,
          { ctx },
        ),
      delete: (id: string, ctx?: CallerContext) =>
        request<void>("DELETE", `/v1/webhook-endpoints/${id}`, { ctx }),
    },

    /** Time-off requests. */
    timeOff: {
      list: (q?: TimeOffListQuery, ctx?: CallerContext) =>
        request<Page<TimeOffRequest>>(
          "GET",
          `/v1/time-off${qs(q as Record<string, string | number | undefined>)}`,
          { ctx },
        ),
      create: (body: TimeOffRequestCreate, ctx?: CallerContext) =>
        request<TimeOffRequest>("POST", "/v1/time-off", { body, ctx }),
      get: (id: string, ctx?: CallerContext) =>
        request<TimeOffRequest>("GET", `/v1/time-off/${id}`, { ctx }),
      decide: (id: string, body: TimeOffDecision, ctx?: CallerContext) =>
        request<TimeOffRequest>("POST", `/v1/time-off/${id}/decision`, { body, ctx }),
    },

    /** Documents (metadata only — fileUrl points at externally-hosted blobs). */
    documents: {
      list: (q?: DocumentListQuery, ctx?: CallerContext) =>
        request<Page<Document>>(
          "GET",
          `/v1/documents${qs(q as Record<string, string | number | undefined>)}`,
          { ctx },
        ),
      create: (body: DocumentCreate, ctx?: CallerContext) =>
        request<Document>("POST", "/v1/documents", { body, ctx }),
      get: (id: string, ctx?: CallerContext) =>
        request<Document>("GET", `/v1/documents/${id}`, { ctx }),
      update: (id: string, body: DocumentUpdate, ctx?: CallerContext) =>
        request<Document>("PATCH", `/v1/documents/${id}`, { body, ctx }),
      delete: (id: string, ctx?: CallerContext) =>
        request<{ id: string; deletedAt: string }>("DELETE", `/v1/documents/${id}`, { ctx }),
    },

    /** Performance reviews. */
    reviews: {
      list: (q?: PerformanceReviewListQuery, ctx?: CallerContext) =>
        request<Page<PerformanceReview>>(
          "GET",
          `/v1/reviews${qs(q as Record<string, string | number | undefined>)}`,
          { ctx },
        ),
      create: (body: PerformanceReviewCreate, ctx?: CallerContext) =>
        request<PerformanceReview>("POST", "/v1/reviews", { body, ctx }),
      get: (id: string, ctx?: CallerContext) =>
        request<PerformanceReview>("GET", `/v1/reviews/${id}`, { ctx }),
      update: (id: string, body: PerformanceReviewUpdate, ctx?: CallerContext) =>
        request<PerformanceReview>("PATCH", `/v1/reviews/${id}`, { body, ctx }),
    },

    /** Org chart (auto-derived from manager relationships). */
    orgChart: {
      get: (ctx?: CallerContext) => request<OrgChart>("GET", "/v1/org-chart", { ctx }),
    },

    /** Company profile (singleton per tenant). */
    company: {
      get: (ctx?: CallerContext) => request<CompanyProfile>("GET", "/v1/company", { ctx }),
      update: (body: CompanyProfileUpdate, ctx?: CallerContext) =>
        request<CompanyProfile>("PUT", "/v1/company", { body, ctx }),
    },

    /** Org settings (singleton per tenant). */
    settings: {
      get: (ctx?: CallerContext) => request<OrgSettings>("GET", "/v1/settings", { ctx }),
      update: (body: OrgSettingsUpdate, ctx?: CallerContext) =>
        request<OrgSettings>("PUT", "/v1/settings", { body, ctx }),
    },

    /** Billing (read-only snapshot). */
    billing: {
      get: (ctx?: CallerContext) =>
        request<BillingSnapshot>("GET", "/v1/billing", { ctx }),
    },

    /** Webhook delivery audit + replay. */
    webhookDeliveries: {
      list: (q?: WebhookDeliveryListQuery, ctx?: CallerContext) =>
        request<Page<WebhookDelivery>>(
          "GET",
          `/v1/webhook-deliveries${qs(q as Record<string, string | number | undefined>)}`,
          { ctx },
        ),
      get: (id: string, ctx?: CallerContext) =>
        request<WebhookDelivery>("GET", `/v1/webhook-deliveries/${id}`, { ctx }),
      redeliver: (id: string, ctx?: CallerContext) =>
        request<WebhookDelivery>(
          "POST",
          `/v1/webhook-deliveries/${id}/redeliver`,
          { ctx },
        ),
    },
  };
}

export type MyHRClient = ReturnType<typeof createClient>;
