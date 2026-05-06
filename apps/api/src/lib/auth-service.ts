/**
 * Verify access tokens issued by the external auth service
 * (https://github.com/proark1/auth).
 *
 * On first use we bootstrap from the auth service:
 *   - GET /.well-known/openid-configuration → `issuer`, `jwks_uri`
 *   - POST /v1/oauth/token (client_credentials) → service token
 *   - GET /v1/clients/me with that token → `audience` for our client
 *
 * The audience returned by /v1/clients/me is what the auth service signs
 * into JWTs for tokens issued to our users — we pin it during verification
 * so a token meant for a different relying party fails closed.
 *
 * The verifier short-circuits with `null` when AUTH_API_URL or the OAuth
 * client credentials are unset, so the API still boots for master +
 * tenant-key callers.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../env.js";

export type AuthClaims = JWTPayload & {
  sub: string;
  email: string;
  name?: string;
  is_super_admin?: boolean;
};

type Verifier = {
  jwks: ReturnType<typeof createRemoteJWKSet>;
  issuer: string;
  audience: string;
};

let _verifier: Verifier | null | undefined;
let _verifierInflight: Promise<Verifier | null> | null = null;

let _serviceToken: { token: string; expiresAt: number } | null = null;
let _serviceTokenInflight: Promise<string> | null = null;

function authBase(): string | null {
  if (!env.AUTH_API_URL) return null;
  return env.AUTH_API_URL.endsWith("/") ? env.AUTH_API_URL : `${env.AUTH_API_URL}/`;
}

async function fetchJson<T>(url: URL, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`auth service ${url.pathname} → ${res.status}`);
  }
  return (await res.json()) as T;
}

async function fetchServiceToken(): Promise<string> {
  const base = authBase();
  if (!base || !env.AUTH_CLIENT_ID || !env.AUTH_CLIENT_SECRET) {
    throw new Error("AUTH_CLIENT_ID / AUTH_CLIENT_SECRET are not configured");
  }
  const res = await fetch(new URL("v1/oauth/token", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: env.AUTH_CLIENT_ID,
      client_secret: env.AUTH_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`auth service /v1/oauth/token → ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  const ttlSeconds = (body.expires_in ?? 60 * 50) - 60;
  _serviceToken = {
    token: body.access_token,
    expiresAt: Date.now() + Math.max(ttlSeconds, 30) * 1000,
  };
  return body.access_token;
}

async function getServiceToken(): Promise<string> {
  if (_serviceToken && Date.now() < _serviceToken.expiresAt) return _serviceToken.token;
  if (_serviceTokenInflight) return _serviceTokenInflight;
  _serviceTokenInflight = fetchServiceToken().finally(() => {
    _serviceTokenInflight = null;
  });
  return _serviceTokenInflight;
}

async function bootstrapVerifier(): Promise<Verifier | null> {
  const base = authBase();
  if (!base) return null;
  if (!env.AUTH_CLIENT_ID || !env.AUTH_CLIENT_SECRET) return null;

  const oidc = await fetchJson<{ issuer: string; jwks_uri: string }>(
    new URL(".well-known/openid-configuration", base),
  );

  const token = await getServiceToken();
  const meRes = await fetch(new URL("v1/clients/me", base), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!meRes.ok) throw new Error(`auth service /v1/clients/me → ${meRes.status}`);
  const me = (await meRes.json()) as { audience: string };

  return {
    jwks: createRemoteJWKSet(new URL(oidc.jwks_uri)),
    issuer: oidc.issuer,
    audience: me.audience,
  };
}

async function getVerifier(): Promise<Verifier | null> {
  if (_verifier !== undefined) return _verifier;
  if (_verifierInflight) return _verifierInflight;
  _verifierInflight = bootstrapVerifier()
    .then((v) => {
      _verifier = v;
      return v;
    })
    .catch((err) => {
      // Don't cache failures — let the next request retry. Otherwise a
      // single transient blip during boot would 401 every user request
      // until the process restarts.
      _verifierInflight = null;
      throw err;
    })
    .finally(() => {
      _verifierInflight = null;
    });
  return _verifierInflight;
}

export async function verifyAccessToken(token: string): Promise<AuthClaims | null> {
  let verifier: Verifier | null;
  try {
    verifier = await getVerifier();
  } catch {
    return null;
  }
  if (!verifier) return null;
  try {
    const { payload } = await jwtVerify(token, verifier.jwks, {
      issuer: verifier.issuer,
      audience: verifier.audience,
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return payload as AuthClaims;
  } catch {
    return null;
  }
}
