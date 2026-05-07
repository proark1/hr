# Upgrading

Guide for upgrading services that integrated with the OurTeamManagement API
**before the partner-keys release** ([#35], merged 2026-05-07).

If you're standing up a fresh deployment, ignore this file and follow
[`DEPLOYMENT.md`](./DEPLOYMENT.md) — it's already up to date.

[#35]: https://github.com/proark1/hr/pull/35

---

## What changed (TL;DR)

| Area | Before | After |
|---|---|---|
| Auth tiers | root master, tenant key, user JWT | root master, **partner**, tenant key, user JWT |
| API key prefix length | 12 chars (`mh_live_xxxx`) | **24 chars** (`mh_live_xxxxxxxxxxxxxxxx`) |
| Org provisioning | root master + user only | root master + **partner** + user |
| `Org` response shape | as before | adds nullable `partnerId` |
| Multi-integrator support | sharing the root master | each integrator gets their own partner key |

**One genuine break**, three additive changes, and one operational shift —
walked through case-by-case below. Find your scenario, follow the steps.

---

## Scenario 1 — Tenants who minted API keys from the dashboard

**Affected:** any org that minted a key via the dashboard (or `POST
/v1/api-keys`) **before** PR #35 deployed.

**What broke:** the lookup-prefix length changed from 12 → 24 chars (to keep
collision probability astronomically low under the `prefix UNIQUE`
constraint). Old keys are still cryptographically valid, but the API now
slices a 24-char prefix from incoming tokens and won't find a matching
12-char prefix in `api_keys`. Result: `401 unauthorized`.

**What to do (per affected org):**

1. Sign in to the dashboard → API Keys.
2. Click **Create**, give it a name (e.g. `prod-2026-05`), copy the
   plaintext value (shown once).
3. Update the integration's secret store to use the new value.
4. Redeploy/restart the consumer.
5. Once you've confirmed the new key is in use (check `lastUsedAt` in the
   dashboard), revoke the old key. The old key's row stays for audit.

**No** server-side migration is possible — we never store plaintext, so we
can't lengthen the prefix on existing rows. Re-mint is the only path.

> If you've got many tenants with active keys, treat this like a
> credential rotation: announce, support, then enforce.

---

## Scenario 2 — External integrators that were given `MASTER_API_KEY`

**Affected:** any third party (e.g. OneTap.ai-style resellers) you handed
the env-var master key to so they could provision and operate orgs for
their own customers.

**Why migrate:** sharing the root master means one partner's incident is
every partner's incident — no individual revocation, no audit attribution,
no cross-integrator data isolation. Partner keys fix all three.

**Migration steps (operator side, 5 minutes per integrator):**

```bash
# 1. Create the Partner record
curl -X POST https://<api-domain>/v1/partners \
  -H "Authorization: Bearer $MASTER_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"name":"OneTap.ai","contactEmail":"ops@onetap.ai"}'
# → { "id": "<partner-uuid>", ... }

# 2. Mint a partner key (plaintext shown ONCE — capture it now)
curl -X POST https://<api-domain>/v1/partners/<partner-uuid>/keys \
  -H "Authorization: Bearer $MASTER_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"name":"prod-2026-05"}'
# → { "key": "mh_live_…", ... }

# 3. Backfill orgs the integrator already provisioned with the master key.
#    These exist with partner_id=NULL today; they need to be re-tagged so
#    the integrator can see them under their new partner key.
psql "$DATABASE_URL" \
  -c "UPDATE orgs SET partner_id = '<partner-uuid>' WHERE id IN (<list of org ids>);"
```

**Migration steps (integrator side, ~1 line of code):**

```diff
- Authorization: Bearer mh_live_<old root master>
+ Authorization: Bearer mh_live_<new partner key>
```

That's it — the request shape (`X-Tenant-Id`, `X-Actor`, `Idempotency-Key`,
JSON bodies) is identical. The integrator's code does **not** need to
change beyond the credential. Behavior changes that they should test:

- `GET /v1/orgs` now returns only orgs **they** provisioned, not every org
  on the deployment. If their code expected to see all orgs (it
  shouldn't), that's a bug surfaced now.
- `GET/PATCH /v1/orgs/{id}` returns **404** for orgs they didn't
  provision — same effect as "doesn't exist," which is intentional
  (don't leak existence to non-owners).
- Audit-log entries now record `partner_id` and `partner_key_id` in
  metadata, attributing every action to *which* integrator did it.

Once the integrator has cut over and you've verified traffic is hitting
the partner key (`lastUsedAt` updates on `GET /v1/partners/<id>/keys`),
**rotate the root master** if it was ever shared with them — generate a
new value, update `MASTER_API_KEY` in Railway, redeploy. Don't re-share.

### Identifying which orgs to backfill

If you don't have a clean record of which orgs each integrator created,
the audit log can reconstruct it:

```sql
-- `resource` is stored as 'org:<uuid>'; substring strips the prefix so the
-- result is paste-ready for the UPDATE in step 3 above.
SELECT substring(resource from 5) AS org_id,
       MIN(created_at)             AS first_created
  FROM audit_events
 WHERE actor_type = 'master'
   AND action     = 'org.created'
   AND actor_email = 'ops@onetap.ai'  -- if X-Actor was used
 GROUP BY resource
 ORDER BY first_created;
```

Without `X-Actor` attribution there's no automated way to tell apart "your
own backend" master traffic from "OneTap's" master traffic — you'll have
to reconcile against the integrator's own records.

---

## Scenario 3 — Your own backend using `MASTER_API_KEY`

**Affected:** the operator's own services that talk to the API as root
master (e.g. ops scripts, your billing reconciler).

**What changed:** nothing functional. `MASTER_API_KEY` semantics are
unchanged — still cross-everything, still required for partner
management. Continue as before.

**Optional cleanup:** the audit log now distinguishes `actor_type` for
master vs. partner; if you grep audit events, the new `"partner"` value
joins the `"master"` / `"tenant_key"` / `"user"` set you already handle.

---

## Scenario 4 — End-user dashboard sessions

**Affected:** anyone signing in via the web app.

**What changed:** nothing. JWT verification, session cookies,
`X-Org-Id`, membership flow — all unchanged.

---

## Scenario 5 — SDK consumers (`@myhr/sdk`)

**Affected:** any TypeScript/JavaScript code using the published SDK.

**Additive changes (non-breaking):**
- `Org` now carries a nullable `partnerId: string | null`. JS/TS object
  consumers ignore the new field; strict structural type-checks may want
  to accept it explicitly.
- New `partners.*` namespace (`create`, `list`, `get`, `update`) and
  `partners.keys.*` namespace (`create`, `list`, `revoke`). Operator-only
  calls; ignore unless you're building partner-management tooling.

**To pick up the changes:**

```bash
pnpm up @myhr/sdk@latest
# or yarn / npm equivalent
```

No code edits required to keep existing calls working.

---

## Scenario 6 — OpenAPI / generated clients

**Affected:** anything pinned to a generated client off `apps/api/openapi.json`.

**What changed:**
- New `Partners` tag with 7 operations.
- New `partnerApiKey` security scheme.
- `Org` schema gains `partnerId: string | nullable`.
- Header descriptions on `X-Tenant-Id` and `X-Actor` now mention partner
  callers.
- Examples updated to 24-char `prefix` values.

**To pick up the changes:** regenerate your client off the new
`openapi.json` (mirrored at <https://proark1.github.io/hr/openapi.json>).

---

## Order of operations for the operator

If you're rolling this out today, this is the order that minimizes
breakage windows:

1. **Deploy the API.** Railway runs `prisma migrate deploy` automatically;
   the new schema lands without downtime (additive columns + new table).
2. **Mint partner keys** for every integrator currently sharing
   `MASTER_API_KEY` (Scenario 2). Backfill `orgs.partner_id` for the orgs
   they previously provisioned.
3. **Hand out the partner keys** out-of-band. Give integrators a deadline
   to cut over.
4. **Notify tenants** with active dashboard-minted API keys (Scenario 1)
   that re-minting is required. Provide a window.
5. **Rotate `MASTER_API_KEY`** once every external integrator is off it.
   Update Railway, redeploy. The integrators won't notice (they're now on
   their own partner keys).
6. **Revoke the old keys** in the dashboard / DB once cutover is
   confirmed via `lastUsedAt`.

---

## Rollback

If you need to roll back the API code, the schema is forward-compatible:
the old API ignores `partner_id` columns. The new `partners` table will be
orphaned but harmless. Don't roll the migration back — it's additive and
nondestructive.

The `PREFIX_LEN` change is the only thing that's awkward to roll back: any
keys minted **after** the upgrade have 24-char prefixes that the old code
would slice 12-char from and fail to find. If you must roll back, plan to
re-mint those keys too.
