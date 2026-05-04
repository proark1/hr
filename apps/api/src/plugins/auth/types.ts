/**
 * Caller + Actor types for the API auth layer.
 *
 * Three caller types:
 *   - master:     1tap.ai's bootstrap API key (env MASTER_API_KEY).
 *   - tenant_key: org-scoped API key minted from the dashboard. Caller's
 *                 orgId is fixed by the key.
 *   - user:       Better Auth session token forwarded by the web app's
 *                 server actions. orgId is selected per-request via
 *                 X-Org-Id and validated against the user's memberships.
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
