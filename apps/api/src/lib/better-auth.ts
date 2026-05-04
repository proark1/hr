/**
 * Minimal Better Auth instance for the API.
 *
 * The API doesn't run sign-up / sign-in flows — that's the web app's job.
 * Here we only need to verify session tokens (Better Auth's bearer plugin
 * handles that) and read user records. The instance is lazily constructed
 * so the API runs fine with master + tenant-key callers when
 * BETTER_AUTH_SECRET is unset.
 */
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getPrisma } from "@myhr/db";
import { env } from "../env.js";

let _auth: ReturnType<typeof betterAuth> | null | undefined;

export function getAuth(): ReturnType<typeof betterAuth> | null {
  if (_auth !== undefined) return _auth;
  if (!env.BETTER_AUTH_SECRET) {
    _auth = null;
    return null;
  }
  _auth = betterAuth({
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.WEB_APP_URL ?? "http://localhost:3000",
    trustedOrigins: env.WEB_APP_URL ? [env.WEB_APP_URL] : [],
    user: {
      additionalFields: {
        isSuperAdmin: { type: "boolean", defaultValue: false },
      },
    },
    plugins: [bearer()],
  });
  return _auth;
}
