import { createClient, type MyHRClient } from "@myhr/sdk";
import { getSession } from "./session";
import { getActiveOrgIdCookie } from "./active-org";

const apiUrl = process.env.MYHR_API_URL ?? "http://localhost:8080";

/**
 * Returns a per-request OurTeamManagement SDK client wired with the caller's auth-service
 * access token + active org. Always called in server components / server
 * actions / route handlers — never the browser. Returns null when there is
 * no session (the (app) layout redirects in that case before getting here).
 */
export async function getApiClient(opts?: { orgId?: string }): Promise<MyHRClient | null> {
  const session = await getSession();
  if (!session) return null;

  const orgId = opts?.orgId ?? (await getActiveOrgIdCookie());

  return createClient({
    baseUrl: apiUrl,
    getToken: () => session.accessToken,
    ...(orgId ? { defaultOrgId: orgId } : {}),
    fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
  });
}
