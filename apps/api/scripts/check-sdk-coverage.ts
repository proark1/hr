/**
 * Fail the build if the hand-written `@myhr/sdk` client drifts from the
 * OpenAPI spec. We compare the set of `operationId`s in the spec against
 * a curated map of operationId -> SDK method path. New API operations must
 * either get an SDK method (and an entry here) or be deliberately marked
 * `internalOnly` below.
 *
 * Run via: `pnpm --filter @myhr/api openapi:sdk-coverage`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  const unknown: string[] = [];

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
    if (!operationIds.includes(id)) unknown.push(id);
  }

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
  if (unknown.length > 0) {
    console.error(
      "✗ SDK_METHODS entries reference operationIds not present in the spec:\n  - " +
        unknown.join("\n  - ") +
        "\n  Either rename the operation in the route or remove the stale entry.",
    );
    failed = true;
  }

  if (failed) process.exit(1);
  console.log(
    `✓ SDK covers all ${operationIds.length - INTERNAL_ONLY.size} public operations.`,
  );
}

main();
