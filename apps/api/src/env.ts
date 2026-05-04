import { z } from "zod";

const Env = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().default(8080),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    DATABASE_URL: z.string().min(1),
    DIRECT_DATABASE_URL: z.string().min(1).optional(),
    PUBLIC_API_URL: z.string().url().optional(),
    MASTER_API_KEY: z.string().min(16),
    FIELD_ENCRYPTION_KEY: z.string().optional(),
    WEBHOOK_SIGNING_SECRET: z.string().optional(),
    // Better Auth — only required once we accept end-user logins. The user
    // strategy short-circuits with 401 if these aren't set, so the API runs
    // happily with master + tenant-key callers only.
    BETTER_AUTH_SECRET: z.string().min(16).optional(),
    // Public origin of the web app (Vercel). Used as Better Auth's baseURL
    // and trustedOrigins. Required as soon as BETTER_AUTH_SECRET is set —
    // otherwise session verification + origin checks would silently fail
    // against a localhost default in production.
    WEB_APP_URL: z.string().url().optional(),
    // Email — proark1/emailservice (mailnowapi.com). Optional; if absent,
    // invitation emails are logged to stdout instead of sent.
    MAILNOW_API_URL: z.string().url().default("https://mailnowapi.com"),
    MAILNOW_API_KEY: z.string().optional(),
    // Required when MAILNOW_API_KEY is set. e.g. "MyHR <noreply@myhr.eu>".
    EMAIL_FROM: z.string().optional(),
  })
  .refine((d) => !d.BETTER_AUTH_SECRET || !!d.WEB_APP_URL, {
    message: "WEB_APP_URL is required when BETTER_AUTH_SECRET is set",
    path: ["WEB_APP_URL"],
  })
  .refine((d) => !d.MAILNOW_API_KEY || !!d.EMAIL_FROM, {
    message: "EMAIL_FROM is required when MAILNOW_API_KEY is set",
    path: ["EMAIL_FROM"],
  });

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;
