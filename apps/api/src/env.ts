import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(8080),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),
  MASTER_API_KEY: z.string().min(16),
  FIELD_ENCRYPTION_KEY: z.string().optional(),
  WEBHOOK_SIGNING_SECRET: z.string().optional(),
  // Better Auth — only required once we accept end-user logins. The user
  // strategy short-circuits with 401 if these aren't set, so the API runs
  // happily with master + tenant-key callers only.
  BETTER_AUTH_SECRET: z.string().min(16).optional(),
  // Public origin of the web app (Vercel). Used as Better Auth's baseURL
  // and trustedOrigins. Optional in dev.
  WEB_APP_URL: z.string().url().optional(),
});

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;
