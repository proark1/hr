import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getPrisma } from "@myhr/db";

const baseURL = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;

const googleProvider =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : undefined;

/**
 * Server-side Better Auth instance.
 *
 * Tables (User/Session/Account/Verification) live in the same Postgres the
 * API uses. The bearer plugin lets server actions extract a token to
 * forward to the API; nextCookies wires Set-Cookie headers correctly with
 * Next's server actions and route handlers.
 */
export const auth = betterAuth({
  database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET ?? "",
  baseURL,
  trustedOrigins: process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : [],
  emailAndPassword: { enabled: true, autoSignIn: true },
  ...(googleProvider ? { socialProviders: googleProvider } : {}),
  user: {
    additionalFields: {
      isSuperAdmin: { type: "boolean", defaultValue: false },
    },
  },
  plugins: [bearer(), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
