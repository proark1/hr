import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// In dev, transparently load .env so `pnpm api:dev` works without requiring
// the operator to source the file. Local `apps/api/.env` takes precedence
// over the repo-root `.env` because process.loadEnvFile does not overwrite
// existing process.env entries. Production runtimes (Railway, Vercel) inject
// env vars natively and won't have a .env on disk.
const candidates = new Set([
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
]);
for (const candidate of candidates) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
  }
}

const Env = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().default(8080),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    DATABASE_URL: z.string().min(1),
    DIRECT_DATABASE_URL: z.string().min(1).optional(),
    PUBLIC_API_URL: z.string().url().optional(),
    MASTER_API_KEY: z.string().min(16),
    // Rate limiting. Token-bucket per authenticated caller (master keyId,
    // tenant keyId, or user id). 600/min sustained with bursts up to 60.
    // Set RATE_LIMIT_DISABLED=1 in tests to bypass the limiter entirely.
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(600),
    RATE_LIMIT_BURST: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_DISABLED: z
      .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
      .optional()
      .transform((v) => v === "1" || v === "true"),
    FIELD_ENCRYPTION_KEY: z.string().optional(),
    WEBHOOK_SIGNING_SECRET: z.string().optional(),
    // Set to disable the pg-boss-backed webhook worker (e.g. in tests). The
    // CRUD routes still work; deliveries are recorded as `pending` and
    // never sent.
    WEBHOOKS_DISABLED: z
      .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
      .optional()
      .transform((v) => v === "1" || v === "true"),
    // External auth service (proark1/auth) — only required once we accept
    // end-user logins. The user strategy short-circuits with 401 if
    // AUTH_API_URL is unset, so the API runs happily with master +
    // tenant-key callers only.
    AUTH_API_URL: z.string().url().optional(),
    // OAuth client credentials. Used to call /v1/clients/me at boot to
    // discover the audience the auth service signs into our JWTs (we used
    // to pin AUTH_JWT_ISSUER / AUTH_JWT_AUDIENCE manually; both are now
    // sourced from /.well-known/openid-configuration + /v1/clients/me).
    AUTH_CLIENT_ID: z.string().min(1).optional(),
    AUTH_CLIENT_SECRET: z.string().min(1).optional(),
    // Public origin of the web app (Vercel). Used for CORS / trusted
    // origins. Optional; only the web app strictly needs it.
    WEB_APP_URL: z.string().url().optional(),
    // Email — proark1/emailservice (mailnowapi.com). Optional; if absent,
    // invitation emails are logged to stdout instead of sent.
    MAILNOW_API_URL: z.string().url().default("https://mailnowapi.com"),
    MAILNOW_API_KEY: z.string().optional(),
    // Required when MAILNOW_API_KEY is set. e.g. "OurTeamManagement <noreply@ourteammanagement.com>".
    EMAIL_FROM: z.string().optional(),
  })
  .refine((d) => !d.AUTH_API_URL || (!!d.AUTH_CLIENT_ID && !!d.AUTH_CLIENT_SECRET), {
    message: "AUTH_CLIENT_ID and AUTH_CLIENT_SECRET are required when AUTH_API_URL is set",
    path: ["AUTH_CLIENT_ID"],
  })
  .refine((d) => !d.MAILNOW_API_KEY || !!d.EMAIL_FROM, {
    message: "EMAIL_FROM is required when MAILNOW_API_KEY is set",
    path: ["EMAIL_FROM"],
  });

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;
