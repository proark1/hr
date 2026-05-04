import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Edge middleware: bounce unauthenticated requests on protected paths to
 * /login. The cookie presence check is cheap; the page-level auth.api
 * check (in a server component) re-validates and decodes the session.
 */
export async function middleware(req: NextRequest) {
  const sessionCookie = getSessionCookie(req);
  if (!sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protect (app) and (super) route groups. Marketing + auth + Better Auth
  // API routes stay public.
  matcher: [
    "/overview/:path*",
    "/employees/:path*",
    "/admin/:path*",
    "/settings/:path*",
    "/api-keys/:path*",
    "/webhooks/:path*",
    "/billing/:path*",
    "/company/:path*",
    "/superadmin/:path*",
  ],
};
