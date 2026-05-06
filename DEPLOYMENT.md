# Deployment

MyHR runs as two services + one Postgres, plus the external [proark1/auth](https://github.com/proark1/auth) service for end-user identity. The web app and API talk to each other; both talk to the same Postgres. The web app talks to the auth service server-side; the API verifies access tokens against the auth service's JWKS.

```
                      ┌────────────────────┐         ┌──────────────────────┐
              cookie  │  Vercel: apps/web  │ ──────► │  proark1/auth        │
   browser ──────────►│                    │         │  (login, refresh,    │
                      └─────────┬──────────┘         │   /.well-known/jwks) │
                                │ Bearer (auth-      └─────────┬────────────┘
                                │  service JWT)                │ JWKS
                                ▼                              ▼
                      ┌────────────────────┐         (verifies access tokens)
1tap (master key) ───►│  Railway: apps/api │
                      │                    │
                      └─────────┬──────────┘
                                │
                                ▼
                      ┌────────────────────┐
                      │  Railway: Postgres │  shared schema, RLS-enforced
                      └────────────────────┘
```

## Env-var matrix

The auth service is the source of truth for end-user identity. Both MyHR services need to point at the same auth instance and agree on `AUTH_JWT_ISSUER` + `AUTH_JWT_AUDIENCE` so JWTs verify cleanly.

### Vercel (`apps/web`)

Set on **both** Production and Preview environments:

| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://...@<host>.proxy.rlwy.net:<port>/railway` | Railway Postgres **public** URL (Variables tab → click eye icon). Used by Prisma during build (`db generate`) and any server-side reads. |
| `DIRECT_DATABASE_URL` | same | Prisma uses this for migrations; same value is fine. |
| `AUTH_API_URL` | `https://<auth-service-domain>` | Base URL of the proark1/auth deployment. |
| `NEXT_PUBLIC_APP_URL` | `https://<vercel-domain>` | Used in invite links + the auth-service callback URL. |
| `MYHR_API_URL` | `https://<railway-api-domain>` | The API's public URL. |

Vercel project settings → **Root Directory: `apps/web`**, framework auto-detected as Next.js. The pnpm workspace is handled automatically.

### Railway (`apps/api`)

| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Reference) | Internal Railway URL — fast, doesn't egress. |
| `DIRECT_DATABASE_URL` | same | |
| `MASTER_API_KEY` | `mh_live_$(openssl rand -hex 32)` | 1tap's only credential. Share out-of-band. |
| `AUTH_API_URL` | same as Vercel `AUTH_API_URL` | Used to fetch the JWKS for verifying access tokens. |
| `AUTH_JWT_ISSUER` | the auth service's `iss` claim | Pinned during JWT verification. |
| `AUTH_JWT_AUDIENCE` | a value reserved for MyHR (e.g. `myhr`) | Pinned during JWT verification. |
| `WEB_APP_URL` | same as Vercel `NEXT_PUBLIC_APP_URL` | Used for invitation links + CORS. |
| `MAILNOW_API_KEY` | from your mailnowapi dashboard | Optional. Without it, invitation emails are logged to stdout instead of sent. |
| `EMAIL_FROM` | `MyHR <noreply@yourdomain>` | Required when `MAILNOW_API_KEY` is set. |
| `MAILNOW_API_URL` | `https://mailnowapi.com` (default) | Override if running the email service elsewhere. |
| `PUBLIC_API_URL` | `https://<railway-api-domain>` | Used as `servers[0].url` in the OpenAPI spec so Swagger UI's "Try it out" works. |
| `FIELD_ENCRYPTION_KEY` | `openssl rand -base64 32` | Reserved for the next PR (sensitive HR fields). |
| `WEBHOOK_SIGNING_SECRET` | `openssl rand -hex 32` | Reserved for the webhook delivery PR. |

## First-time setup

1. **Deploy proark1/auth** (separate Railway project, see its README). Note its public URL, configured `JWT_ISSUER`, and pick an `aud` value reserved for MyHR.
2. **Generate the master key**:
   ```bash
   echo "MASTER_API_KEY=mh_live_$(openssl rand -hex 32)"
   ```
3. **Railway** → API service → Variables → paste `MASTER_API_KEY`, `AUTH_API_URL`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`, plus the rest from the table.
4. **Vercel** → `hr-web` project → Settings → Environment Variables → add the Vercel rows from the table. `AUTH_API_URL` must point at the same auth deployment as Railway.
5. **Redeploy both** services so they pick up the new env.
6. Visit your Vercel URL, sign up (handled by the auth service), verify your email, sign in, create an org. The dashboard should load.

## Custom domain (optional)

- Web app → `app.myhr.eu` (or your domain)
  - Vercel → Settings → Domains → add `app.myhr.eu`, follow DNS instructions
  - Update `NEXT_PUBLIC_APP_URL` on Vercel
  - Update `WEB_APP_URL` on Railway
- API → `api.myhr.eu`
  - Railway → API service → Settings → Networking → Custom Domain
  - Update `MYHR_API_URL` on Vercel
  - Update `PUBLIC_API_URL` on Railway
- Marketing → `myhr.eu` (apex)
  - Vercel → same project → add `myhr.eu`, follow DNS

After every domain change: redeploy both services so the env vars take effect.

## Verifying the deploy is healthy

```bash
# 1. API is up
curl https://<api-domain>/healthz
# → {"ok":true}

# 2. 1tap path still works (master key + X-Tenant-Id is unaffected by the user auth path)
curl https://<api-domain>/v1/orgs \
  -H "Authorization: Bearer $MASTER_API_KEY"

# 3. Web app loads
curl -I https://<web-domain>
# → 200 OK

# 4. Auth service JWKS is reachable from the API region
curl https://<auth-domain>/.well-known/jwks.json
```

End-to-end smoke test (browser):

1. Sign up at `https://<web-domain>/signup` with email/password — the form calls the auth service's `/v1/register`.
2. Click the verification link from the email the auth service sent.
3. Sign in at `/login` → cookies are set with the access + refresh tokens.
4. Land on `/onboarding` → enter an org name → submit.
5. Land on `/overview` with stat cards showing zeros.
6. `/employees/new` → add a test employee → row appears in `/employees`.
7. `/admin/invite` → invite a second email → if `MAILNOW_API_KEY` is set, the invite arrives by email; if not, the page shows the accept URL to copy.

## Things to watch out for

- **Issuer / audience mismatch** between the auth service and the API is the most common foot-gun. Symptom: login works but every API call returns 401. Check `AUTH_JWT_ISSUER` and `AUTH_JWT_AUDIENCE` on Railway match what the auth service signs into JWTs.
- **JWKS caching**: `jose`'s remote JWKS caches keys; if you rotate keys on the auth service, allow a few minutes for the API to pick up the new ones, or restart the API service.
- **Email deliverability**: `EMAIL_FROM` must be on a domain you've configured DKIM/SPF for inside mailnowapi. Otherwise invitations land in spam.
- **Cold starts**: Vercel may cold-start after inactivity; first signup after a quiet period is ~1–2 s slower. Acceptable for B2B.
