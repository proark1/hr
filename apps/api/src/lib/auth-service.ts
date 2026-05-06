/**
 * Verify access tokens issued by the external auth service
 * (https://github.com/proark1/auth).
 *
 * Tokens are short-lived JWTs signed with rotating keys and verified against
 * the JWKS published at `${AUTH_API_URL}/.well-known/jwks.json`. We pin the
 * issuer + audience to fail closed if a token meant for a different relying
 * party is presented.
 *
 * The verifier is lazily constructed so the API still boots when AUTH_API_URL
 * is unset (master + tenant-key callers continue to work).
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../env.js";

let _jwks: ReturnType<typeof createRemoteJWKSet> | null | undefined;

function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  if (_jwks !== undefined) return _jwks;
  if (!env.AUTH_API_URL) {
    _jwks = null;
    return null;
  }
  _jwks = createRemoteJWKSet(new URL("/.well-known/jwks.json", env.AUTH_API_URL));
  return _jwks;
}

export type AuthClaims = JWTPayload & {
  sub: string;
  email: string;
  name?: string;
  is_super_admin?: boolean;
};

export async function verifyAccessToken(token: string): Promise<AuthClaims | null> {
  const jwks = getJwks();
  if (!jwks) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.AUTH_JWT_ISSUER,
      audience: env.AUTH_JWT_AUDIENCE,
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return payload as AuthClaims;
  } catch {
    return null;
  }
}
