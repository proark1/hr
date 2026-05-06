import { redirect } from "next/navigation";
import { getSession, type Session } from "./session";

/**
 * Resolve the current user from the auth-service-backed session. Redirects
 * to /login when there's no live session — fine for use inside (app) routes
 * already gated by the layout.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
