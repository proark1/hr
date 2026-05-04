/**
 * Fail the build if the hand-written `@myhr/sdk` client drifts from the
 * OpenAPI spec. Two checks:
 *
 *   1. Every public `operationId` in the spec maps to a callable SDK
 *      method (or is explicitly `INTERNAL_ONLY`).
 *   2. Every URL the SDK calls (`/v1/...`) corresponds to a path in the
 *      spec — so a client method can't quietly point at a route that
 *      doesn't exist.
 *
 * Run via: `pnpm --filter @myhr/api openapi:sdk-coverage`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@myhr/sdk";

type Spec = {
  paths: Record<string, Record<string, { operationId?: string } | unknown>>;
};

const HTTP_METHODS = ["get", "post", "patch", "put", "delete"] as const;

/**
 * Operations that don't need an SDK method. Document the reason here so a
 * future PR doesn't re-add a method by reflex.
 */
const INTERNAL_ONLY = new Set<string>([
  "healthCheck", // ops + Railway probes hit /healthz directly
  "root", // banner endpoint, not part of the API surface
]);

/** Map operationId → SDK method path (dot-separated, relative to client root). */
const SDK_METHODS: Record<string, string> = {
  getMe: "me.get",
  listMyOrgs: "me.listMyOrgs",

  listOrgs: "orgs.list",
  createOrg: "orgs.create",
  getOrg: "orgs.get",
  updateOrg: "orgs.update",

  listMembers: "members.list",

  createInvitation: "invitations.create",
  listInvitations: "invitations.list",
  acceptInvitation: "invitations.accept",

  createApiKey: "apiKeys.create",
  listApiKeys: "apiKeys.list",

  listEmployees: "employees.list",
  createEmployee: "employees.create",
  getEmployee: "employees.get",
  updateEmployee: "employees.update",
  deleteEmployee: "employees.delete",
  exportEmployee: "employees.exportData",

  superadminListOrgs: "superadmin.listOrgs",
};

function getOperationIds(spec: Spec): string[] {
  const ids: string[] = [];
  for (const item of Object.values(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const op = (item as Record<string, unknown>)[method] as
        | { operationId?: string }
        | undefined;
      if (op?.operationId) ids.push(op.operationId);
    }
  }
  return ids;
}

function pathExists(root: unknown, dotted: string): boolean {
  let cur: unknown = root;
  for (const part of dotted.split(".")) {
    if (cur == null || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "function";
}

/** Pull every `"/v1/..."` and `\`${...}/v1/...\`` path literal out of the
 *  SDK source. Strips template-string interpolations to a `{param}` form so
 *  it matches the OpenAPI path templates. */
function extractSdkPaths(src: string): string[] {
  const out = new Set<string>();
  // Match plain string literals: "/v1/anything" or '/v1/anything'.
  for (const m of src.matchAll(/["']\/v1\/[^"'\s]*["']/g)) {
    out.add(m[0].slice(1, -1));
  }
  // Match template literals containing /v1/. Mid-path `${...}` segments map
  // to a `{id}` path param; trailing `${...}` (no following `/`) is a query
  // string helper and is dropped — query strings aren't part of the URL
  // template.
  for (const m of src.matchAll(/`\/v1\/[^`]*`/g)) {
    let raw = m[0].slice(1, -1);
    raw = raw.replace(/\$\{[^}]+\}\//g, "{id}/");
    raw = raw.replace(/\$\{[^}]+\}$/g, "");
    out.add(raw);
  }
  return [...out].map((p) => p.replace(/\?.*$/, "").replace(/\/$/, ""));
}

/** Normalize an OpenAPI path template by collapsing all `{x}` to `{id}`
 *  so SDK extraction (which always uses `{id}`) matches consistently. */
function normalize(path: string): string {
  return path.replace(/\{[^}]+\}/g, "{id}");
}

function main(): void {
  const specPath = resolve(process.cwd(), "openapi.json");
  const spec = JSON.parse(readFileSync(specPath, "utf-8")) as Spec;

  // Build a real client to introspect method shape.
  const client = createClient({
    baseUrl: "https://example.invalid",
    getToken: () => "stub",
  });

  const operationIds = getOperationIds(spec);

  const missing: string[] = [];
  const broken: string[] = [];
  const unknownIds: string[] = [];

  for (const id of operationIds) {
    if (INTERNAL_ONLY.has(id)) continue;
    const method = SDK_METHODS[id];
    if (!method) {
      missing.push(id);
      continue;
    }
    if (!pathExists(client, method)) {
      broken.push(`${id} → ${method}`);
    }
  }

  for (const id of Object.keys(SDK_METHODS)) {
    if (!operationIds.includes(id)) unknownIds.push(id);
  }

  // URL drift: SDK calls a path the spec doesn't declare.
  const here = dirname(fileURLToPath(import.meta.url));
  const sdkSrc = readFileSync(
    resolve(here, "../../../packages/sdk/src/client.ts"),
    "utf-8",
  );
  const sdkPaths = extractSdkPaths(sdkSrc).map(normalize);
  const specPaths = new Set(Object.keys(spec.paths).map(normalize));
  const unknownPaths = [...new Set(sdkPaths)].filter((p) => !specPaths.has(p));

  let failed = false;
  if (missing.length > 0) {
    console.error(
      "✗ Operations in openapi.json have no SDK mapping:\n  - " +
        missing.join("\n  - ") +
        "\n  Add them to SDK_METHODS in scripts/check-sdk-coverage.ts (or to" +
        " INTERNAL_ONLY with a justification).",
    );
    failed = true;
  }
  if (broken.length > 0) {
    console.error(
      "✗ SDK methods missing for mapped operations:\n  - " + broken.join("\n  - "),
    );
    failed = true;
  }
  if (unknownIds.length > 0) {
    console.error(
      "✗ SDK_METHODS entries reference operationIds not present in the spec:\n  - " +
        unknownIds.join("\n  - ") +
        "\n  Either rename the operation in the route or remove the stale entry.",
    );
    failed = true;
  }
  if (unknownPaths.length > 0) {
    console.error(
      "✗ SDK calls URLs not declared in openapi.json:\n  - " +
        unknownPaths.join("\n  - ") +
        "\n  Either add the route or remove/rename the SDK call site.",
    );
    failed = true;
  }

  if (failed) process.exit(1);
  console.log(
    `✓ SDK covers all ${operationIds.length - INTERNAL_ONLY.size} public operations and ${sdkPaths.length} SDK call sites match spec paths.`,
  );
}

main();
