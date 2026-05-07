/**
 * Enrich the raw spec emitted by `app.swagger()` with the polish that
 * fastify-zod can't infer from route schemas alone:
 *
 *   - `examples` on request bodies, query strings, path params, and 2xx/4xx
 *     responses, sourced from `openapi-fixtures.ts`.
 *   - `x-codeSamples` per operation: a curl invocation and an `@myhr/sdk`
 *     snippet, both runnable.
 *   - `x-tagGroups` so Redoc renders a sensible nav (Public API / Admin /
 *     Internal).
 *
 * Pure data transform. Reads the spec object, mutates it, returns it.
 */

import { ERROR_EXAMPLES, FIXTURES, SAMPLES, type OperationFixture } from "./openapi-fixtures.js";
import { WEBHOOKS } from "./openapi-webhooks.js";

type Json = Record<string, unknown>;
type Operation = Json & {
  operationId?: string;
  parameters?: Array<Json & { name: string; in: string }>;
  requestBody?: Json;
  responses?: Record<string, Json>;
  tags?: string[];
  security?: unknown[];
};
type PathItem = Record<string, Operation | unknown>;

const HTTP_METHODS = ["get", "post", "patch", "put", "delete"] as const;
type Method = (typeof HTTP_METHODS)[number];

/**
 * Operations whose handler responds with `204 No Content`. fastify-zod can't
 * model a body-less response, so we declare it here and inject a content-less
 * 204 entry into the spec. Any operationId in this set must NOT also declare a
 * 2xx response in its route schema.
 */
const NO_CONTENT_OPERATIONS = new Set<string>(["deleteWebhookEndpoint"]);

const TAG_GROUPS: Array<{ name: string; tags: string[] }> = [
  { name: "Public API", tags: ["Employees", "Orgs", "Members", "Invitations"] },
  { name: "Admin", tags: ["ApiKeys", "Me"] },
  { name: "Webhooks", tags: ["Webhooks"] },
  { name: "Internal", tags: ["SuperAdmin", "Health"] },
];

/** SDK call site per operationId. The fn shape mirrors @myhr/sdk client.ts. */
const SDK_CALLS: Record<string, (args: { fixture: OperationFixture }) => string> = {
  // Me
  getMe: () => `await myhr.me.get();`,
  listMyOrgs: () => `await myhr.me.listMyOrgs();`,

  // Orgs
  listOrgs: () => `await myhr.orgs.list({ limit: 50 });`,
  createOrg: ({ fixture }) =>
    `await myhr.orgs.create(${j(fixture.body)});`,
  getOrg: () => `await myhr.orgs.get("${SAMPLES.orgId}");`,
  updateOrg: ({ fixture }) =>
    `await myhr.orgs.update("${SAMPLES.orgId}", ${j(fixture.body)});`,

  // Members
  listMembers: () => `await myhr.members.list();`,

  // Invitations
  createInvitation: ({ fixture }) =>
    `await myhr.invitations.create(${j(fixture.body)});`,
  listInvitations: () => `await myhr.invitations.list();`,
  acceptInvitation: () =>
    `await myhr.invitations.accept("${SAMPLES.inviteToken}");`,

  // API keys
  createApiKey: ({ fixture }) =>
    `await myhr.apiKeys.create(${j(fixture.body)});`,
  listApiKeys: () => `await myhr.apiKeys.list();`,

  // Employees
  listEmployees: () =>
    `await myhr.employees.list({ status: "active", limit: 50 });`,
  createEmployee: ({ fixture }) =>
    `await myhr.employees.create(${j(fixture.body)});`,
  getEmployee: () =>
    `await myhr.employees.get("${SAMPLES.employeeId}");`,
  updateEmployee: ({ fixture }) =>
    `await myhr.employees.update("${SAMPLES.employeeId}", ${j(fixture.body)});`,
  deleteEmployee: () =>
    `await myhr.employees.delete("${SAMPLES.employeeId}");`,
  exportEmployee: () =>
    `await myhr.employees.exportData("${SAMPLES.employeeId}");`,

  // Superadmin
  superadminListOrgs: () =>
    `await myhr.superadmin.listOrgs({ limit: 50 });`,

  // Webhook endpoints
  createWebhookEndpoint: ({ fixture }) =>
    `await myhr.webhookEndpoints.create(${j(fixture.body)});`,
  listWebhookEndpoints: () => `await myhr.webhookEndpoints.list();`,
  getWebhookEndpoint: () =>
    `await myhr.webhookEndpoints.get("${SAMPLES.webhookEndpointId}");`,
  updateWebhookEndpoint: ({ fixture }) =>
    `await myhr.webhookEndpoints.update("${SAMPLES.webhookEndpointId}", ${j(fixture.body)});`,
  rotateWebhookEndpointSecret: () =>
    `await myhr.webhookEndpoints.rotateSecret("${SAMPLES.webhookEndpointId}");`,
  deleteWebhookEndpoint: () =>
    `await myhr.webhookEndpoints.delete("${SAMPLES.webhookEndpointId}");`,

  // Webhook deliveries
  listWebhookDeliveries: () =>
    `await myhr.webhookDeliveries.list({ status: "delivered", limit: 50 });`,
  getWebhookDelivery: () =>
    `await myhr.webhookDeliveries.get("${SAMPLES.webhookDeliveryId}");`,
  redeliverWebhookDelivery: () =>
    `await myhr.webhookDeliveries.redeliver("${SAMPLES.webhookDeliveryId}");`,
};

function j(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

function fillPath(template: string, params: Record<string, string> = {}): string {
  return template.replace(/\{([^}]+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}

function toQueryString(q?: Record<string, string | number>): string {
  if (!q) return "";
  const entries = Object.entries(q);
  if (entries.length === 0) return "";
  const s = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `?${s}`;
}

function paramNames(op: Operation, where: "path" | "query" | "header"): string[] {
  return (op.parameters ?? [])
    .filter((p) => p.in === where)
    .map((p) => p.name);
}

function hasHeader(op: Operation, name: string): boolean {
  return paramNames(op, "header").some(
    (n) => n.toLowerCase() === name.toLowerCase(),
  );
}

function buildCurl(args: {
  baseUrl: string;
  method: Method;
  path: string;
  op: Operation;
  fixture: OperationFixture;
}): string {
  const { baseUrl, method, op, fixture } = args;
  const concretePath = fillPath(args.path, fixture.pathParams);
  const url = `${baseUrl}${concretePath}${toQueryString(fixture.query)}`;

  const lines: string[] = [`curl -X ${method.toUpperCase()} '${url}' \\`];
  lines.push(`  -H 'Authorization: Bearer $MYHR_API_KEY' \\`);
  if (hasHeader(op, "x-tenant-id")) {
    lines.push(`  -H 'X-Tenant-Id: ${fixture.tenantId ?? SAMPLES.orgId}' \\`);
  }
  if (hasHeader(op, "idempotency-key")) {
    lines.push(`  -H 'Idempotency-Key: '"$(uuidgen)" \\`);
  }
  if (fixture.body !== undefined) {
    lines.push(`  -H 'Content-Type: application/json' \\`);
    const body = JSON.stringify(fixture.body);
    lines.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
  } else {
    // Strip the trailing backslash from the last header line.
    lines[lines.length - 1] = lines[lines.length - 1]!.replace(/ \\$/, "");
  }
  return lines.join("\n");
}

function buildSdkSnippet(operationId: string, fixture: OperationFixture): string | null {
  const fn = SDK_CALLS[operationId];
  if (!fn) return null;
  return [
    `import { createClient } from "@myhr/sdk";`,
    ``,
    `const myhr = createClient({`,
    `  baseUrl: "https://api.ourteammanagement.com",`,
    `  getToken: () => process.env.MYHR_API_KEY!,`,
    `  defaultTenantId: "${SAMPLES.orgId}",`,
    `});`,
    ``,
    fn({ fixture }),
  ].join("\n");
}

/** Attach an `example` to every JSON Schema descendant of `node`. We pick
 *  the first matching media type and inject example into the schema slot,
 *  which Redoc renders prominently. */
function setMediaExample(content: Json | undefined, example: unknown): void {
  if (!content) return;
  const mediaTypes = Object.values(content) as Json[];
  for (const mt of mediaTypes) {
    mt.example = example;
  }
}

function applyExamples(op: Operation, fixture: OperationFixture): void {
  // Path params.
  if (fixture.pathParams) {
    for (const p of op.parameters ?? []) {
      if (p.in !== "path") continue;
      const v = fixture.pathParams[p.name];
      if (v !== undefined) {
        (p as Json).example = v;
      }
    }
  }

  // Query params.
  if (fixture.query) {
    for (const p of op.parameters ?? []) {
      if (p.in !== "query") continue;
      const v = fixture.query[p.name];
      if (v !== undefined) {
        (p as Json).example = v;
      }
    }
  }

  // Request body.
  if (fixture.body !== undefined && op.requestBody) {
    setMediaExample((op.requestBody as Json).content as Json | undefined, fixture.body);
  }

  // 2xx response.
  if (fixture.response !== undefined && op.responses) {
    for (const code of Object.keys(op.responses)) {
      if (code.startsWith("2")) {
        setMediaExample(
          (op.responses[code] as Json).content as Json | undefined,
          fixture.response,
        );
      }
    }
  }

  // 4xx + 5xx canned errors.
  if (op.responses) {
    for (const [code, resp] of Object.entries(op.responses)) {
      const n = Number(code);
      if (!Number.isFinite(n) || n < 400) continue;
      const example = ERROR_EXAMPLES[n];
      if (example !== undefined) {
        setMediaExample((resp as Json).content as Json | undefined, example);
      }
    }
  }
}

function applyCodeSamples(args: {
  baseUrl: string;
  method: Method;
  path: string;
  op: Operation;
  fixture: OperationFixture;
}): void {
  const samples: Array<{ lang: string; label: string; source: string }> = [];

  samples.push({
    lang: "bash",
    label: "curl",
    source: buildCurl(args),
  });

  if (args.op.operationId) {
    const sdk = buildSdkSnippet(args.op.operationId, args.fixture);
    if (sdk) {
      samples.push({ lang: "javascript", label: "@myhr/sdk", source: sdk });
    }
  }

  (args.op as Json)["x-codeSamples"] = samples;
}

export function postprocess(spec: Json): Json {
  const baseUrl =
    (spec.servers as Array<{ url: string }> | undefined)?.[0]?.url ??
    "https://api.ourteammanagement.com";

  const paths = (spec.paths as Record<string, PathItem>) ?? {};
  for (const [path, item] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const op = (item as PathItem)[method] as Operation | undefined;
      if (!op || typeof op !== "object") continue;

      const opId = op.operationId;
      const fixture: OperationFixture = (opId && FIXTURES[opId]) || {};

      if (opId && NO_CONTENT_OPERATIONS.has(opId)) {
        op.responses = op.responses ?? {};
        op.responses["204"] = { description: "Deleted. No response body." };
      }

      applyExamples(op, fixture);
      applyCodeSamples({ baseUrl, method, path, op, fixture });
    }
  }

  // Tag groups for Redoc nav. Redoc reads `x-tagGroups` at the root.
  // Filter to tags that actually exist in the spec.
  const usedTags = new Set<string>();
  for (const item of Object.values(paths)) {
    for (const method of HTTP_METHODS) {
      const op = (item as PathItem)[method] as Operation | undefined;
      for (const t of op?.tags ?? []) usedTags.add(t);
    }
  }
  // Forward-looking webhook contract. Stored under `x-webhooks` (Redoc renders
  // it the same way it would render OpenAPI 3.1 `webhooks`).
  if (Object.keys(WEBHOOKS).length > 0) {
    spec["x-webhooks"] = WEBHOOKS;
    usedTags.add("Webhooks");
    const tags = (spec.tags as Array<Record<string, unknown>> | undefined) ?? [];
    if (!tags.some((t) => t.name === "Webhooks")) {
      tags.push({
        name: "Webhooks",
        description:
          "Webhook endpoint management + delivery audit. Manage where OurTeamManagement delivers events with `/v1/webhook-endpoints/*`; inspect or replay attempts with `/v1/webhook-deliveries/*`. The event payloads OurTeamManagement actually POSTs are documented under the **Webhooks** section.",
      });
      spec.tags = tags;
    }
  }

  spec["x-tagGroups"] = TAG_GROUPS.map((g) => ({
    name: g.name,
    tags: g.tags.filter((t) => usedTags.has(t)),
  })).filter((g) => g.tags.length > 0);

  return spec;
}
