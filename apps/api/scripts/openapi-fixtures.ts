/**
 * Per-operation example fixtures used to enrich the generated OpenAPI spec
 * with concrete request bodies, path params, query strings, and response
 * payloads. One source of truth for `x-codeSamples` and JSON `examples`.
 *
 * Keep these realistic: 1tap engineers paste them into curl / the SDK and
 * expect them to round-trip against a freshly migrated dev DB.
 */

const SAMPLE_ORG_ID = "11111111-2222-3333-4444-555555555555";
const SAMPLE_EMPLOYEE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SAMPLE_INVITE_ID = "00000000-1111-2222-3333-444444444444";
const SAMPLE_INVITE_TOKEN = "inv_4f3c1aa9e2b14d8e9c0f7d6b5e2a1c8d";
const SAMPLE_API_KEY_ID = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
const SAMPLE_MEMBERSHIP_ID = "cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa";
const SAMPLE_USER_ID = "u_01HXYZUSER00000000000000";
const SAMPLE_WEBHOOK_ENDPOINT_ID = "eeeeeeee-aaaa-bbbb-cccc-dddddddddddd";
const SAMPLE_WEBHOOK_DELIVERY_ID = "ffffffff-eeee-dddd-cccc-bbbbbbbbbbbb";
const SAMPLE_EVENT_ID = "11112222-3333-4444-5555-666677778888";
const SAMPLE_WEBHOOK_SECRET =
  "whsec_4f3c1aa9e2b14d8e9c0f7d6b5e2a1c8d4f3c1aa9e2b14d8e9c0f7d6b5e2a1c8d";
const NOW = "2026-05-04T12:00:00.000Z";

export type OperationFixture = {
  /** Path parameters, keyed by name. Used to render concrete URLs. */
  pathParams?: Record<string, string>;
  /** Query string parameters. */
  query?: Record<string, string | number>;
  /** Request body example. */
  body?: unknown;
  /** Response body example (200/201). */
  response?: unknown;
  /** Override the tenant header value. Defaults to SAMPLE_ORG_ID. */
  tenantId?: string;
};

const employee = {
  id: SAMPLE_EMPLOYEE_ID,
  orgId: SAMPLE_ORG_ID,
  externalId: "emp_4271",
  email: "ada@acme.com",
  firstName: "Ada",
  lastName: "Lovelace",
  preferredName: null,
  jobTitle: "Staff Engineer",
  department: "Engineering",
  managerId: null,
  country: "us",
  startDate: "2026-06-01",
  endDate: null,
  status: "onboarding",
  createdAt: NOW,
  updatedAt: NOW,
};

const org = {
  id: SAMPLE_ORG_ID,
  name: "Acme Inc",
  region: "eu",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
};

const member = {
  membershipId: SAMPLE_MEMBERSHIP_ID,
  userId: SAMPLE_USER_ID,
  email: "ada@acme.com",
  name: "Ada Lovelace",
  role: "admin",
  joinedAt: NOW,
};

export const FIXTURES: Record<string, OperationFixture> = {
  // Health
  healthCheck: { response: { ok: true } },
  root: {
    response: {
      name: "MyHR API",
      version: "0.0.1",
      docs: "https://api.myhr.example/openapi",
    },
  },

  // Me
  getMe: {
    response: {
      id: SAMPLE_USER_ID,
      email: "ada@acme.com",
      name: "Ada Lovelace",
      isSuperAdmin: false,
      createdAt: NOW,
    },
  },
  listMyOrgs: {
    response: {
      items: [{ org, role: "admin", joinedAt: NOW }],
    },
  },

  // Orgs
  listOrgs: {
    query: { limit: 50 },
    response: { items: [org], nextCursor: null },
  },
  createOrg: {
    body: { name: "Acme Inc", region: "eu" },
    response: org,
  },
  getOrg: {
    pathParams: { id: SAMPLE_ORG_ID },
    response: org,
  },
  updateOrg: {
    pathParams: { id: SAMPLE_ORG_ID },
    body: { name: "Acme Holdings GmbH" },
    response: { ...org, name: "Acme Holdings GmbH" },
  },

  // Members
  listMembers: { response: { items: [member] } },

  // Invitations
  createInvitation: {
    body: { email: "newhire@acme.com", role: "admin" },
    response: {
      id: SAMPLE_INVITE_ID,
      orgId: SAMPLE_ORG_ID,
      email: "newhire@acme.com",
      role: "admin",
      expiresAt: "2026-05-11T12:00:00.000Z",
      createdAt: NOW,
      acceptUrl: `https://app.myhr.example/invitations/accept?token=${SAMPLE_INVITE_TOKEN}`,
      token: SAMPLE_INVITE_TOKEN,
    },
  },
  listInvitations: {
    response: {
      items: [
        {
          id: SAMPLE_INVITE_ID,
          orgId: SAMPLE_ORG_ID,
          email: "newhire@acme.com",
          role: "admin",
          expiresAt: "2026-05-11T12:00:00.000Z",
          createdAt: NOW,
        },
      ],
    },
  },
  acceptInvitation: {
    body: { token: SAMPLE_INVITE_TOKEN },
    response: {
      id: SAMPLE_MEMBERSHIP_ID,
      orgId: SAMPLE_ORG_ID,
      userId: SAMPLE_USER_ID,
      role: "admin",
      createdAt: NOW,
    },
  },

  // API keys
  createApiKey: {
    body: { name: "Production server (read+write)" },
    response: {
      id: SAMPLE_API_KEY_ID,
      name: "Production server (read+write)",
      prefix: "mh_live_4f3c",
      scope: "tenant",
      lastUsedAt: null,
      createdAt: NOW,
      // Plaintext only ever returned once, on creation.
      key: "mh_live_4f3c1aa9e2b14d8e9c0f7d6b5e2a1c8d",
    },
  },
  listApiKeys: {
    response: {
      items: [
        {
          id: SAMPLE_API_KEY_ID,
          name: "Production server (read+write)",
          prefix: "mh_live_4f3c",
          scope: "tenant",
          lastUsedAt: NOW,
          createdAt: NOW,
        },
      ],
    },
  },

  // Employees
  listEmployees: {
    query: { limit: 50, status: "active" },
    response: { items: [{ ...employee, status: "active" }], nextCursor: null },
  },
  createEmployee: {
    body: {
      email: "ada@acme.com",
      firstName: "Ada",
      lastName: "Lovelace",
      country: "us",
      startDate: "2026-06-01",
      jobTitle: "Staff Engineer",
      department: "Engineering",
    },
    response: employee,
  },
  getEmployee: {
    pathParams: { id: SAMPLE_EMPLOYEE_ID },
    response: employee,
  },
  updateEmployee: {
    pathParams: { id: SAMPLE_EMPLOYEE_ID },
    body: { jobTitle: "Principal Engineer", status: "active" },
    response: { ...employee, jobTitle: "Principal Engineer", status: "active" },
  },
  deleteEmployee: {
    pathParams: { id: SAMPLE_EMPLOYEE_ID },
    response: { id: SAMPLE_EMPLOYEE_ID, deletedAt: NOW },
  },
  exportEmployee: {
    pathParams: { id: SAMPLE_EMPLOYEE_ID },
    response: { employee, exportedAt: NOW },
  },

  // Superadmin
  superadminListOrgs: {
    query: { limit: 50 },
    response: { items: [org], nextCursor: null },
  },

  // Webhook endpoints
  createWebhookEndpoint: {
    body: {
      url: "https://api.1tap.ai/webhooks/myhr",
      events: ["employee.created", "employee.updated"],
    },
    response: {
      id: SAMPLE_WEBHOOK_ENDPOINT_ID,
      orgId: SAMPLE_ORG_ID,
      url: "https://api.1tap.ai/webhooks/myhr",
      events: ["employee.created", "employee.updated"],
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
      secret: SAMPLE_WEBHOOK_SECRET,
    },
  },
  listWebhookEndpoints: {
    response: {
      items: [
        {
          id: SAMPLE_WEBHOOK_ENDPOINT_ID,
          orgId: SAMPLE_ORG_ID,
          url: "https://api.1tap.ai/webhooks/myhr",
          events: ["employee.created", "employee.updated"],
          isActive: true,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    },
  },
  getWebhookEndpoint: {
    pathParams: { id: SAMPLE_WEBHOOK_ENDPOINT_ID },
    response: {
      id: SAMPLE_WEBHOOK_ENDPOINT_ID,
      orgId: SAMPLE_ORG_ID,
      url: "https://api.1tap.ai/webhooks/myhr",
      events: ["employee.created", "employee.updated"],
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
  },
  updateWebhookEndpoint: {
    pathParams: { id: SAMPLE_WEBHOOK_ENDPOINT_ID },
    body: { events: ["employee.created", "employee.updated", "employee.deleted"] },
    response: {
      id: SAMPLE_WEBHOOK_ENDPOINT_ID,
      orgId: SAMPLE_ORG_ID,
      url: "https://api.1tap.ai/webhooks/myhr",
      events: ["employee.created", "employee.updated", "employee.deleted"],
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
  },
  rotateWebhookEndpointSecret: {
    pathParams: { id: SAMPLE_WEBHOOK_ENDPOINT_ID },
    response: {
      id: SAMPLE_WEBHOOK_ENDPOINT_ID,
      orgId: SAMPLE_ORG_ID,
      url: "https://api.1tap.ai/webhooks/myhr",
      events: ["employee.created", "employee.updated"],
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
      secret: SAMPLE_WEBHOOK_SECRET,
    },
  },
  deleteWebhookEndpoint: {
    pathParams: { id: SAMPLE_WEBHOOK_ENDPOINT_ID },
    response: null,
  },

  // Webhook deliveries
  listWebhookDeliveries: {
    query: { limit: 50, status: "delivered" },
    response: {
      items: [delivery()],
      nextCursor: null,
    },
  },
  getWebhookDelivery: {
    pathParams: { id: SAMPLE_WEBHOOK_DELIVERY_ID },
    response: delivery(),
  },
  redeliverWebhookDelivery: {
    pathParams: { id: SAMPLE_WEBHOOK_DELIVERY_ID },
    response: delivery({ status: "pending", attempts: 0, deliveredAt: null }),
  },
};

function delivery(over: Partial<{
  status: string;
  attempts: number;
  deliveredAt: string | null;
}> = {}) {
  return {
    id: SAMPLE_WEBHOOK_DELIVERY_ID,
    orgId: SAMPLE_ORG_ID,
    endpointId: SAMPLE_WEBHOOK_ENDPOINT_ID,
    eventId: SAMPLE_EVENT_ID,
    eventType: "employee.created",
    status: over.status ?? "delivered",
    attempts: over.attempts ?? 1,
    maxAttempts: 8,
    lastResponseCode: 200,
    lastResponseBody: "ok",
    lastError: null,
    lastAttemptAt: NOW,
    nextAttemptAt: null,
    deliveredAt: over.deliveredAt === undefined ? NOW : over.deliveredAt,
    createdAt: NOW,
  };
}

export const ERROR_EXAMPLES: Record<number, unknown> = {
  400: {
    error: {
      code: "bad_request",
      message: "managerId does not reference an employee in this tenant",
    },
  },
  401: {
    error: { code: "unauthorized", message: "Missing or invalid API key" },
  },
  403: {
    error: { code: "forbidden", message: "Caller is not allowed to perform this action" },
  },
  404: {
    error: { code: "not_found", message: "Not found" },
  },
  409: {
    error: {
      code: "conflict",
      message: "An employee with that email or external_id already exists",
    },
  },
  429: {
    error: {
      code: "rate_limited",
      message: "Rate limit exceeded. Retry after 6s.",
      details: { retryAfterSec: 6 },
    },
  },
  500: {
    error: { code: "internal_error", message: "Internal server error" },
  },
};

export const SAMPLES = {
  orgId: SAMPLE_ORG_ID,
  employeeId: SAMPLE_EMPLOYEE_ID,
  inviteId: SAMPLE_INVITE_ID,
  inviteToken: SAMPLE_INVITE_TOKEN,
  userId: SAMPLE_USER_ID,
  apiKeyId: SAMPLE_API_KEY_ID,
  webhookEndpointId: SAMPLE_WEBHOOK_ENDPOINT_ID,
  webhookDeliveryId: SAMPLE_WEBHOOK_DELIVERY_ID,
};
