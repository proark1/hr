import { NextResponse, type NextRequest } from "next/server";
import { decodeJwt } from "jose";

const ACCESS_COOKIE = "myhr_access";
const REFRESH_COOKIE = "myhr_refresh";
const AUTH_API_URL = process.env.AUTH_API_URL ?? "http://localhost:9000";

/**
 * Edge middleware for protected routes.
 *
 * - Bounce to /login when no tokens are present.
 * - When the access token is expired (or close to it) but a refresh token
 *   exists, hit the auth service to rotate the pair and write the new
 *   cookies onto the response. This is the only place the web app refreshes
 *   tokens — server components can't mutate cookies, so the refresh has to
 *   happen here so downstream renders see a fresh access token.
 */
export async function middleware(req: NextRequest) {
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;

  if (access && !isExpired(access)) {
    return NextResponse.next();
  }

  if (!refresh) {
    return redirectToLogin(req);
  }

  try {
    const res = await fetch(`${AUTH_API_URL}/v1/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return redirectToLogin(req, /* clearCookies */ true);
    const tokens = (await res.json()) as { access_token: string; refresh_token: string };
    const next = NextResponse.next();
    setAuthCookie(next, ACCESS_COOKIE, tokens.access_token, 60 * 15);
    setAuthCookie(next, REFRESH_COOKIE, tokens.refresh_token, 60 * 60 * 24 * 30);
    return next;
  } catch {
    return redirectToLogin(req, true);
  }
}

function isExpired(token: string, skewSeconds = 30): boolean {
  try {
    const claims = decodeJwt(token);
    if (typeof claims.exp !== "number") return true;
    return claims.exp * 1000 < Date.now() + skewSeconds * 1000;
  } catch {
    return true;
  }
}

function redirectToLogin(req: NextRequest, clearCookies = false): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  const res = NextResponse.redirect(url);
  if (clearCookies) {
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
  }
  return res;
}

function setAuthCookie(res: NextResponse, name: string, value: string, maxAge: number): void {
  res.cookies.set(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export const config = {
  // Protect (app) and (super) route groups. Marketing + auth pages stay
  // public so unauthenticated visitors can reach login + signup.
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
