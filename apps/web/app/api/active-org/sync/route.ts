import { NextResponse, type NextRequest } from "next/server";
import { getApiClient } from "@/lib/api";
import { setActiveOrgIdCookie } from "@/lib/active-org";
import { getSession } from "@/lib/session";

/**
 * Resolve the active-org cookie from the user's first membership and bounce
 * back to `?return=…`.
 *
 * Called by the (app) layout when the cookie is missing — Server Components
 * can't write cookies, but a Route Handler can. This is a defensive path:
 * loginAction / createOrgAction / switchOrgAction set the cookie in the
 * happy path, so we only land here if a user clears the cookie or it
 * expires while their session is still valid.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const api = await getApiClient();
  if (!api) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const myOrgs = await api.me.listMyOrgs();
  if (myOrgs.items.length === 0) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  await setActiveOrgIdCookie(myOrgs.items[0]!.org.id);

  const returnTo = req.nextUrl.searchParams.get("return") ?? "/overview";
  // Only allow internal paths to prevent open-redirects.
  const safeReturn =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/overview";
  return NextResponse.redirect(new URL(safeReturn, req.url));
}
