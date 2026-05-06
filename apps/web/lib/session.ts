import "server-only";
import { cookies } from "next/headers";
import { decodeJwt } from "jose";
import { logout as authLogout, refresh as authRefresh, type TokenPair } from "./auth-service";

export const ACCESS_COOKIE = "myhr_access";
export const REFRESH_COOKIE = "myhr_refresh";

export type SessionUser = {
  id: string;
  email: string;
  name?: string;
  isSuperAdmin: boolean;
};

export type Session = {
  user: SessionUser;
  /** Bearer token to forward to the MyHR API. */
  accessToken: string;
};

type AccessClaims = {
  sub?: string;
  email?: string;
  name?: string;
  is_super_admin?: boolean;
  exp?: number;
};

function decode(token: string): AccessClaims | null {
  try {
    return decodeJwt(token) as AccessClaims;
  } catch {
    return null;
  }
}

function isExpired(claims: AccessClaims, skewSeconds = 30): boolean {
  if (typeof claims.exp !== "number") return true;
  return claims.exp * 1000 < Date.now() + skewSeconds * 1000;
}

function toUser(claims: AccessClaims): SessionUser | null {
  if (!claims.sub || !claims.email) return null;
  return {
    id: claims.sub,
    email: claims.email,
    name: claims.name,
    isSuperAdmin: claims.is_super_admin === true,
  };
}

const accessCookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  // Mirror the auth service's access token TTL (15min). The cookie is also
  // re-set on every refresh, so the actual lifetime is bounded by the
  // refresh token.
  maxAge: 60 * 15,
};

const refreshCookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

export async function setSessionCookies(tokens: TokenPair): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.access_token, accessCookieOpts);
  store.set(REFRESH_COOKIE, tokens.refresh_token, refreshCookieOpts);
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

/**
 * Resolve the active session.
 *
 * Reads the access token cookie; if missing or about to expire, attempts a
 * refresh using the refresh-token cookie. Refresh rotates the token pair,
 * so we persist the new values when we're called from a context that can
 * mutate cookies (server actions / route handlers). In server components
 * cookie mutation throws — we swallow the persistence step and rely on
 * middleware to refresh again on the next request.
 *
 * Returns null when there is no live session.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (access) {
    const claims = decode(access);
    if (claims && !isExpired(claims)) {
      const user = toUser(claims);
      if (user) return { user, accessToken: access };
    }
  }

  if (!refreshToken) return null;

  let pair: TokenPair;
  try {
    pair = await authRefresh(refreshToken);
  } catch {
    return null;
  }

  const claims = decode(pair.access_token);
  const user = claims ? toUser(claims) : null;
  if (!user) return null;

  try {
    await setSessionCookies(pair);
  } catch {
    // Cookies can't be mutated from a Server Component render. Middleware
    // will refresh + persist on the next request.
  }
  return { user, accessToken: pair.access_token };
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    try {
      await authLogout(refreshToken);
    } catch {
      // Best-effort revocation; clear cookies regardless.
    }
  }
  await clearSessionCookies();
}
