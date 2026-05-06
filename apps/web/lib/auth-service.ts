import "server-only";

/**
 * Server-only client for the external auth service (proark1/auth).
 *
 * The web app never exposes the auth API to the browser — login, signup,
 * refresh, and logout all flow through server actions or middleware so
 * refresh tokens stay in httpOnly cookies and never reach client JS.
 */

const AUTH_API_URL = process.env.AUTH_API_URL ?? "http://localhost:9000";
const AUTH_BASE = AUTH_API_URL.endsWith("/") ? AUTH_API_URL : `${AUTH_API_URL}/`;

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  /** Seconds until the access token expires. */
  expires_in?: number;
};

export type LoginSuccess = { kind: "tokens"; tokens: TokenPair };
export type MfaChallenge = { kind: "mfa"; mfaToken: string };
export type LoginResult = LoginSuccess | MfaChallenge;

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

async function call<T>(
  path: string,
  init: { method: string; body?: unknown; bearer?: string } = { method: "GET" },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.bearer) headers["authorization"] = `Bearer ${init.bearer}`;

  // Strip any leading slash so `new URL` resolves against the base path
  // rather than the host root — keeps a deployment with a path prefix
  // (e.g. https://example.com/auth) working.
  const url = new URL(path.replace(/^\//, ""), AUTH_BASE);
  const res = await fetch(url, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json: unknown = text ? safeParse(text) : null;

  if (!res.ok) {
    const body = (json ?? {}) as { error?: { message?: string; code?: string }; message?: string };
    const message = body.error?.message ?? body.message ?? `Auth service ${res.status}`;
    throw new AuthServiceError(message, res.status, body.error?.code);
  }
  return json as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const body = await call<
    { access_token: string; refresh_token: string; expires_in?: number } | { mfa_token: string }
  >("/v1/login", { method: "POST", body: { email, password } });
  if ("mfa_token" in body) return { kind: "mfa", mfaToken: body.mfa_token };
  return { kind: "tokens", tokens: body };
}

export async function loginMfa(mfaToken: string, code: string): Promise<TokenPair> {
  return call<TokenPair>("/v1/login/mfa", {
    method: "POST",
    body: { mfa_token: mfaToken, code },
  });
}

export async function register(email: string, password: string, name?: string): Promise<void> {
  await call<unknown>("/v1/register", {
    method: "POST",
    body: { email, password, ...(name ? { name } : {}) },
  });
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  return call<TokenPair>("/v1/token/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}

export async function logout(refreshToken: string): Promise<void> {
  await call<unknown>("/v1/logout", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}

export type AuthMe = {
  id: string;
  email: string;
  name?: string;
  email_verified?: boolean;
  is_super_admin?: boolean;
};

export async function me(accessToken: string): Promise<AuthMe> {
  return call<AuthMe>("/v1/me", { method: "GET", bearer: accessToken });
}
