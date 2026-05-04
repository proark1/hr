import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "./auth";

/**
 * Resolve the current user from Better Auth. Throws to /login if missing,
 * which is fine for use inside (app) routes already gated by the layout.
 */
export async function requireSession(): Promise<Session> {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) redirect("/login");
  return session;
}
