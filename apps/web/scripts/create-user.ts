/**
 * One-off: create a Better Auth user (email + password) directly against the
 * configured Postgres. Useful when the browser sign-up flow is failing and you
 * need a usable login while you debug.
 *
 * Run from the web workspace with the same env you set on Vercel:
 *
 *   DATABASE_URL=...                  # Railway public proxy URL
 *   DIRECT_DATABASE_URL=...           # same value is fine
 *   BETTER_AUTH_SECRET=...            # must match the deployed value
 *   NEXT_PUBLIC_APP_URL=https://hr-web-pi.vercel.app
 *   pnpm --filter @myhr/web exec tsx scripts/create-user.ts <email> [password]
 *
 * If <password> is omitted a 16-char random one is generated and printed.
 *
 * The account is created the same way `auth/sign-up/email` would, so the
 * resulting credentials work in the regular login form.
 */
import { randomBytes } from "node:crypto";
import { auth } from "../lib/auth";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: tsx scripts/create-user.ts <email> [password]");
    process.exit(1);
  }
  const password = process.argv[3] ?? randomBytes(12).toString("base64url");
  const name = email.split("@")[0];

  const result = await auth.api.signUpEmail({
    body: { email, password, name },
  });

  console.log("Created user:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log(`  user id:  ${result.user?.id ?? "(unknown)"}`);
}

main().catch((err) => {
  console.error("create-user failed:", err);
  process.exit(1);
});
