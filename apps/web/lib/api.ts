import { headers } from "next/headers";
import { createClient, type MyHRClient } from "@myhr/sdk";
import { auth } from "./auth";
import { getActiveOrgIdCookie } from "./active-org";

const apiUrl = process.env.MYHR_API_URL ?? "http://localhost:8080";

/**
 * Returns a per-request MyHR SDK client wired with the caller's Better Auth
 * session token + active org. Always called in server components / server
 * actions / route handlers — never the browser. Returns null when there is
 * no session (the (app) layout redirects in that case before getting here).
 */
export async function getApiClient(opts?: { orgId?: string }): Promise<MyHRClient | null> {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return null;

  const orgId = opts?.orgId ?? (await getActiveOrgIdCookie());

  return createClient({
    baseUrl: apiUrl,
    getToken: () => session.session.token,
    ...(orgId ? { defaultOrgId: orgId } : {}),
    fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
  });
}
