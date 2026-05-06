import "server-only";

/**
 * Server-only client for the external auth service (proark1/auth).
 *
 * The web app never exposes the auth API to the browser — login, signup,
 * refresh, and logout all flow through server actions or middleware so
 * refresh tokens stay in httpOnly cookies and never reach client JS.
 *
 * Service-token auth: registration is forwarded with a `client_credentials`
 * bearer so the auth service stamps the new user with our `clientId` and
 * sends the verification email from our branded `from_address` to our
 * web origin (otherwise the email links land on the auth service's host).
 */

const AUTH_API_URL = process.env.AUTH_API_URL ?? "http://localhost:9000";
const AUTH_BASE = AUTH_API_URL.endsWith("/") ? AUTH_API_URL : `${AUTH_API_URL}/`;
const AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID;
const AUTH_CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET;

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
): Promise<{ status: number; body: T }> {
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

  if (res.status === 204) return { status: 204, body: undefined as T };

  const text = await res.text();
  const json: unknown = text ? safeParse(text) : null;

  if (!res.ok) {
    const body = (json ?? {}) as { error?: { message?: string; code?: string }; message?: string };
    const message = body.error?.message ?? body.message ?? `Auth service ${res.status}`;
    throw new AuthServiceError(message, res.status, body.error?.code);
  }
  return { status: res.status, body: json as T };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// -- Service token (client_credentials) -------------------------------------

type ServiceToken = { token: string; expiresAt: number };

let _serviceToken: ServiceToken | null = null;
let _inflight: Promise<string> | null = null;

async function fetchServiceToken(): Promise<string> {
  if (!AUTH_CLIENT_ID || !AUTH_CLIENT_SECRET) {
    throw new AuthServiceError(
      "AUTH_CLIENT_ID / AUTH_CLIENT_SECRET are not configured",
      500,
      "auth_client_not_configured",
    );
  }
  const { body } = await call<{ access_token: string; expires_in?: number }>("/v1/oauth/token", {
    method: "POST",
    body: {
      grant_type: "client_credentials",
      client_id: AUTH_CLIENT_ID,
      client_secret: AUTH_CLIENT_SECRET,
    },
  });
  // Refresh ~60s before the auth service expires it. Defaults to 50min if
  // expires_in is missing from the response.
  const ttlSeconds = (body.expires_in ?? 60 * 50) - 60;
  _serviceToken = {
    token: body.access_token,
    expiresAt: Date.now() + Math.max(ttlSeconds, 30) * 1000,
  };
  return body.access_token;
}

async function getServiceToken(): Promise<string> {
  if (_serviceToken && Date.now() < _serviceToken.expiresAt) return _serviceToken.token;
  if (_inflight) return _inflight;
  _inflight = fetchServiceToken().finally(() => {
    _inflight = null;
  });
  return _inflight;
}

function evictServiceToken(): void {
  _serviceToken = null;
}

/**
 * Server-to-server call against the auth service that needs a
 * client_credentials bearer. Retries once after evicting the cached token
 * if the auth service rejects with 401 (mid-rotation).
 */
async function serviceCall<T>(path: string, body: unknown): Promise<T> {
  const attempt = async (): Promise<{ status: number; body: T }> => {
    const token = await getServiceToken();
    return call<T>(path, { method: "POST", body, bearer: token });
  };
  try {
    const res = await attempt();
    return res.body;
  } catch (err) {
    if (err instanceof AuthServiceError && err.status === 401) {
      evictServiceToken();
      const res = await attempt();
      return res.body;
    }
    throw err;
  }
}

// -- Public API -------------------------------------------------------------

export async function login(email: string, password: string): Promise<LoginResult> {
  const { body } = await call<
    { access_token: string; refresh_token: string; expires_in?: number } | { mfa_token: string }
  >("/v1/login", { method: "POST", body: { email, password } });
  if ("mfa_token" in body) return { kind: "mfa", mfaToken: body.mfa_token };
  return { kind: "tokens", tokens: body };
}

export async function loginMfa(mfaToken: string, code: string): Promise<TokenPair> {
  const { body } = await call<TokenPair>("/v1/login/mfa", {
    method: "POST",
    body: { mfa_token: mfaToken, code },
  });
  return body;
}

/**
 * Forward a self-serve signup to the auth service. The bearer is a service
 * token issued to this client — the auth service uses it to attribute the
 * new user to our `clientId` (so verification emails come from our branded
 * sender and link back to our web origin).
 *
 * The `name` field is sent through best-effort; the auth team's documented
 * contract is `{ email, password }` so older auth-service builds may ignore
 * it. We collect it so the upsert in the API has something to populate.
 */
export async function register(email: string, password: string, name?: string): Promise<void> {
  await serviceCall<unknown>("/v1/register", {
    email,
    password,
    ...(name ? { name } : {}),
  });
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  const { body } = await call<TokenPair>("/v1/token/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
  return body;
}

export async function logout(refreshToken: string): Promise<void> {
  await call<unknown>("/v1/logout", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}

export async function verifyEmail(token: string): Promise<void> {
  await call<unknown>("/v1/email/verify", { method: "POST", body: { token } });
}

export async function resendVerification(email: string): Promise<void> {
  await call<unknown>("/v1/email/verify/resend", { method: "POST", body: { email } });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await call<unknown>("/v1/password/forgot", { method: "POST", body: { email } });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await call<unknown>("/v1/password/reset", {
    method: "POST",
    body: { token, new_password: newPassword },
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
  const { body } = await call<AuthMe>("/v1/me", { method: "GET", bearer: accessToken });
  return body;
}
