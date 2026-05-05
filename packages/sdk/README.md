# @myhr/sdk

Hand-written, fully-typed REST client for the [MyHR API](https://github.com/proark1/hr).
One method per `operationId` in [`apps/api/openapi.json`](../../apps/api/openapi.json).
CI fails the build if the spec and the SDK drift apart
(`pnpm --filter @myhr/api openapi:sdk-coverage`).

For the full API reference (every operation, request/response shape, examples,
and webhook payloads), see the hosted Redoc docs published from the OpenAPI
spec on every push to `main`.

## Install

This package is consumed inside the monorepo as `workspace:*` and is not yet
published to npm. To depend on it from another workspace package:

```jsonc
// package.json
{
  "dependencies": {
    "@myhr/sdk": "workspace:*"
  }
}
```

## Quickstart

```ts
import { createClient } from "@myhr/sdk";

const myhr = createClient({
  baseUrl: "https://api.myhr.example",
  getToken: () => process.env.MYHR_API_KEY!,
  defaultTenantId: "11111111-2222-3333-4444-555555555555",
});

const employees = await myhr.employees.list({ status: "active", limit: 50 });
```

## Configuration

`createClient(config)` accepts:

| Field             | Type                              | Required | Notes                                                                 |
| ----------------- | --------------------------------- | -------- | --------------------------------------------------------------------- |
| `baseUrl`         | `string`                          | yes      | e.g. `https://api.myhr.example`                                       |
| `getToken`        | `() => string \| Promise<string>` | yes      | Bearer token. Master/tenant key (`mh_live_…`) or Better Auth session. |
| `defaultOrgId`    | `string`                          | no       | Sets `X-Org-Id` on every call (end-user callers).                     |
| `defaultTenantId` | `string`                          | no       | Sets `X-Tenant-Id` on every call (master callers).                    |
| `fetch`           | `typeof fetch`                    | no       | Inject a custom fetch (e.g. Next.js server fetch with cache control). |

Per-call overrides go through the optional `ctx` argument:

```ts
await myhr.employees.create(
  { email: "ada@acme.com", firstName: "Ada", lastName: "Lovelace" },
  { tenantId: "...", idempotencyKey: "my-own-key" },
);
```

## Authentication

Three credential types are supported. All travel as
`Authorization: Bearer <token>`; the SDK picks none for you — you decide what
`getToken` returns.

| Token format              | Used by                              | Org context                  |
| ------------------------- | ------------------------------------ | ---------------------------- |
| `mh_live_…` (master)      | 1tap's backend, cross-tenant         | `X-Tenant-Id` (per-call)     |
| `mh_live_…` (tenant)      | A startup's own integrations         | derived from key (ignored)   |
| Better Auth session token | The MyHR web app on behalf of a user | `X-Org-Id` (per-call)        |

## Idempotency

Writes (`POST` / `PATCH` / `DELETE`) automatically send an `Idempotency-Key`
(UUID v4 via `crypto.randomUUID()`). Override it via `ctx.idempotencyKey` if
you need replay control. Replays within 24h return the cached response;
reusing a key with a different body returns `409 conflict`.

## Errors

Non-2xx responses throw `MyHRError`:

```ts
import { MyHRError } from "@myhr/sdk";

try {
  await myhr.employees.get("missing-id");
} catch (err) {
  if (err instanceof MyHRError) {
    err.status; // number, e.g. 404
    err.code;   // stable string code: "not_found" | "forbidden" | ...
    err.message;
    err.details;
  }
}
```

Stable error codes: `bad_request`, `tenant_required`, `unauthorized`,
`forbidden`, `not_found`, `conflict`, `internal_error`. New codes are
additive — switch on `code` and treat unknown codes as a generic failure.

## Webhooks

Verify the `Webhook-Signature` header on inbound deliveries. Format is
`t=<unix-seconds>,v1=<hex-hmac-sha256>` of `<t>.<raw-body>` (Stripe-compatible).

```ts
import { verifyWebhookSignature } from "@myhr/sdk";

const ok = verifyWebhookSignature({
  rawBody: req.rawBody, // exact bytes the server received
  header: req.headers["webhook-signature"],
  secret: process.env.WEBHOOK_SIGNING_SECRET!,
});
if (!ok) return res.status(400).send();
```

Returns `false` for missing/malformed headers, replays older than 5 minutes,
or signature mismatches. Comparison is constant-time.

## Surface area

The client groups methods by resource. Each method maps 1:1 to an
`operationId` in the OpenAPI spec.

- `me` — `get`, `listMyOrgs`
- `orgs` — `list`, `create`, `get`, `update`
- `members` — `list`
- `invitations` — `create`, `list`, `accept`
- `apiKeys` — `create`, `list`
- `employees` — `list`, `create`, `get`, `update`, `delete`, `exportData`
- `superadmin` — `listOrgs`
- `webhookEndpoints` — `create`, `list`, `get`, `update`, `rotateSecret`, `delete`
- `webhookDeliveries` — `list`, `get`, `redeliver`

Cursor-paginated endpoints return `{ items, nextCursor }`. Loop until
`nextCursor` is `null`.
