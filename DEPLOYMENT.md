# Deployment

MyHR runs as two services + one Postgres. The web app and API talk to each other; both talk to the same Postgres.

```
                      ┌────────────────────┐
              cookie  │  Vercel: apps/web  │  Next.js + Better Auth
   browser ──────────►│                    │
                      └─────────┬──────────┘
                                │ Bearer (Better Auth session token)
                                ▼
                      ┌────────────────────┐
1tap (master key) ───►│  Railway: apps/api │  Fastify + Prisma
                      │                    │
                      └─────────┬──────────┘
                                │
                                ▼
                      ┌────────────────────┐
                      │  Railway: Postgres │  shared schema, RLS-enforced
                      └────────────────────┘
```

## Env-var matrix

The two services share **`BETTER_AUTH_SECRET`** so a session token issued by the web app verifies on the API. They must match exactly.

### Vercel (`apps/web`)

Set on **both** Production and Preview environments:

| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://...@<host>.proxy.rlwy.net:<port>/railway` | Railway Postgres **public** URL (Variables tab → click eye icon). Better Auth queries this directly. |
| `DIRECT_DATABASE_URL` | same | Prisma uses this for migrations; same value is fine. |
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` | **Must match Railway's value.** Rotating means re-deploying both. |
| `BETTER_AUTH_URL` | `https://<vercel-domain>` | Or your custom domain. |
| `NEXT_PUBLIC_APP_URL` | `https://<vercel-domain>` | Same as above. |
| `MYHR_API_URL` | `https://<railway-api-domain>` | The API's public URL. |
| `GOOGLE_CLIENT_ID` | from Google Cloud Console | Optional; enables Google sign-in if both client id + secret are set. |
| `GOOGLE_CLIENT_SECRET` | same | Optional. |

Vercel project settings → **Root Directory: `apps/web`**, framework auto-detected as Next.js. The pnpm workspace is handled automatically.

### Railway (`apps/api`)

| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Reference) | Internal Railway URL — fast, doesn't egress. |
| `DIRECT_DATABASE_URL` | same | |
| `MASTER_API_KEY` | `mh_live_$(openssl rand -hex 32)` | 1tap's only credential. Share out-of-band. |
| `BETTER_AUTH_SECRET` | **must match Vercel's value** | Without this, the API can't verify web app sessions and all user-auth requests return 401. |
| `WEB_APP_URL` | same as Vercel `BETTER_AUTH_URL` | Required when `BETTER_AUTH_SECRET` is set; used for invitation links + Better Auth `trustedOrigins`. |
| `MAILNOW_API_KEY` | from your mailnowapi dashboard | Optional. Without it, invitation emails are logged to stdout instead of sent. |
| `EMAIL_FROM` | `MyHR <noreply@yourdomain>` | Required when `MAILNOW_API_KEY` is set. |
| `MAILNOW_API_URL` | `https://mailnowapi.com` (default) | Override if running the email service elsewhere. |
| `PUBLIC_API_URL` | `https://<railway-api-domain>` | Used as `servers[0].url` in the OpenAPI spec so Swagger UI's "Try it out" works. |
| `FIELD_ENCRYPTION_KEY` | `openssl rand -base64 32` | Reserved for the next PR (sensitive HR fields). |
| `WEBHOOK_SIGNING_SECRET` | `openssl rand -hex 32` | Reserved for the webhook delivery PR. |

## First-time setup

1. **Generate two secrets**, save them somewhere reachable:
   ```bash
   echo "MASTER_API_KEY=mh_live_$(openssl rand -hex 32)"
   echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)"
   ```
2. **Railway** → API service → Variables → paste both above plus the rest from the table.
3. **Vercel** → `hr-web` project → Settings → Environment Variables → add the Vercel rows from the table. Make sure `BETTER_AUTH_SECRET` is the **same** value as on Railway.
4. **Redeploy both** services so they pick up the new env.
5. Visit your Vercel URL, sign up, create an org. The dashboard should load.

## Custom domain (optional)

- Web app → `app.myhr.eu` (or your domain)
  - Vercel → Settings → Domains → add `app.myhr.eu`, follow DNS instructions
  - Update `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` on Vercel
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
```

End-to-end smoke test (browser):

1. Sign up at `https://<web-domain>/signup` with email/password.
2. Land on `/onboarding` → enter an org name → submit.
3. Land on `/overview` with stat cards showing zeros.
4. `/employees/new` → add a test employee → row appears in `/employees`.
5. `/admin/invite` → invite a second email → if `MAILNOW_API_KEY` is set, the invite arrives by email; if not, the page shows the accept URL to copy.

## Things to watch out for

- **`BETTER_AUTH_SECRET` mismatch** between Vercel and Railway is the most common foot-gun. Symptom: signup works but the dashboard immediately bounces back to `/login` because `/v1/me` returns 401.
- **Database connection limits**: the web app's Better Auth + the API's Prisma both connect to the same Postgres. Railway's free tier caps at ~10 connections. If you scale Vercel out, switch to Railway's paid plan or front Postgres with PgBouncer.
- **Email deliverability**: `EMAIL_FROM` must be on a domain you've configured DKIM/SPF for inside mailnowapi. Otherwise invitations land in spam.
- **Cold starts**: Vercel may cold-start after inactivity; first signup after a quiet period is ~1–2 s slower. Acceptable for B2B.
