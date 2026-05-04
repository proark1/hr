import { z } from "zod";
import { MembershipRole } from "./membership.js";

export const Invitation = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  email: z.string().email(),
  role: MembershipRole,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type Invitation = z.infer<typeof Invitation>;

export const InvitationCreate = z.object({
  email: z.string().email(),
  role: MembershipRole,
});
export type InvitationCreate = z.infer<typeof InvitationCreate>;

export const InvitationCreated = Invitation.extend({
  acceptUrl: z.string().url().describe("Send this URL to the invitee."),
  // The plaintext token is returned on creation so the web app can compose
  // and send the invitation email itself. Once we wire Resend on the API
  // side this field will be removed.
  token: z
    .string()
    .describe("Plaintext acceptance token, only returned at creation time."),
});
export type InvitationCreated = z.infer<typeof InvitationCreated>;

export const InvitationAccept = z.object({
  token: z.string().min(1),
});
export type InvitationAccept = z.infer<typeof InvitationAccept>;
