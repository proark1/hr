import { z } from "zod";
import { Org } from "./org.js";

export const MembershipRole = z.enum(["owner", "admin", "manager", "member"]);
export type MembershipRole = z.infer<typeof MembershipRole>;

export const Membership = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  userId: z.string(),
  role: MembershipRole,
  createdAt: z.string().datetime(),
});
export type Membership = z.infer<typeof Membership>;

/** Item returned by GET /v1/me/orgs — denormalised org + caller's role. */
export const MyOrg = z.object({
  org: Org,
  role: MembershipRole,
  joinedAt: z.string().datetime(),
});
export type MyOrg = z.infer<typeof MyOrg>;

/** Item returned by GET /v1/orgs/:id/members — joined with user. */
export const Member = z.object({
  membershipId: z.string().uuid(),
  userId: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: MembershipRole,
  joinedAt: z.string().datetime(),
});
export type Member = z.infer<typeof Member>;
