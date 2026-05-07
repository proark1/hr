/**
 * Caller + Actor types for the API auth layer.
 *
 * Three caller types:
 *   - master:     The operator's bootstrap API key (env MASTER_API_KEY).
 *                 One per deployment; cross-tenant.
 *   - tenant_key: org-scoped API key minted from the dashboard. Caller's
 *                 orgId is fixed by the key.
 *   - user:       Access token (JWT) issued by the external auth service
 *                 (proark1/auth) and forwarded by the web app. orgId is
 *                 selected per-request via X-Org-Id and validated against
 *                 the user's memberships.
 */

import type { MembershipRole } from "@myhr/db";

export type Caller =
  | { type: "master"; keyId: string | null }
  | { type: "tenant_key"; keyId: string; orgId: string }
  | {
      type: "user";
      userId: string;
      email: string;
      isSuperAdmin: boolean;
      memberships: ReadonlyArray<{ orgId: string; role: MembershipRole }>;
    };

export type Actor = {
  id?: string;
  email?: string;
  name?: string;
};

declare module "fastify" {
  interface FastifyRequest {
    caller: Caller;
    actor: Actor;
  }
}
