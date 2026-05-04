import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import crypto from "node:crypto";
import { z } from "zod";
import {
  Invitation,
  InvitationCreate,
  InvitationCreated,
  Membership,
  InvitationAccept,
} from "@myhr/types";
import { withTenant } from "@myhr/db";
import { env } from "../env.js";
import { Errors } from "../errors.js";
import { sendInvitationEmail } from "../lib/email.js";
import {
  errorResponses,
  orgReadHeaders,
  orgWriteHeaders,
  userWriteHeaders,
} from "../lib/openapi.js";

const ListResponse = z.object({ items: z.array(Invitation) });

const INVITE_TTL_DAYS = 7;

function generateToken(): { token: string; tokenHash: string } {
  // 32 bytes → 64 hex chars. URL-safe enough; we transmit it in a path.
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function buildAcceptUrl(token: string): string {
  // env.WEB_APP_URL is required when BETTER_AUTH_SECRET is set; for the
  // master-only path we still need a URL to put in the email. Fall back
  // to a placeholder that 1tap can replace if they prefer their own UX.
  const base = env.WEB_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/accept-invite/${token}`;
}

const invitationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "",
    {
      schema: {
        tags: ["Invitations"],
        operationId: "createInvitation",
        summary: "Invite someone to the org",
        description:
          "Creates an invitation record and returns the acceptance URL plus the plaintext token. Owner/admin only for user callers; master + tenant_key callers bypass the role check.",
        headers: orgWriteHeaders,
        body: InvitationCreate,
        response: { 201: InvitationCreated, ...errorResponses(400, 401, 403, 409, 429, 500) },
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin"] },
      },
    },
    async (req, reply) => {
      const caller = req.caller;
      const invitedBy = caller.type === "user" ? caller.userId : null;
      if (!invitedBy) {
        // Machine callers must pretend to be someone — for now, require an
        // existing user we can attribute to. Until we wire 1tap's actor into
        // a "synthetic user", machine callers can't create invitations.
        throw Errors.forbidden(
          "Invitations must be created by an authenticated user (machine callers not supported yet)",
        );
      }
      const { token, tokenHash } = generateToken();
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

      const isMaster = caller.type === "master";
      const userId = caller.type === "user" ? caller.userId : null;
      const result = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster, userId },
        async (tx) => {
          const inv = await tx.invitation.create({
            data: {
              orgId: req.tenantId!,
              email: req.body.email,
              role: req.body.role,
              tokenHash,
              invitedByUserId: invitedBy,
              expiresAt,
            },
          });
          // Pull names alongside in the same tx so we can compose a useful email.
          const org = await tx.org.findUnique({
            where: { id: req.tenantId! },
            select: { name: true },
          });
          const inviter = await tx.user.findUnique({
            where: { id: invitedBy },
            select: { name: true, email: true },
          });
          return { inv, orgName: org?.name ?? "your org", inviter };
        },
      ).catch((err: unknown) => {
        if (
          typeof err === "object" &&
          err &&
          "code" in err &&
          (err as { code: string }).code === "P2002"
        ) {
          throw Errors.conflict("An open invitation for this email already exists in this org");
        }
        throw err;
      });

      const { inv, orgName, inviter } = result;
      const acceptUrl = buildAcceptUrl(token);

      // Fire-and-forget the email but await so we can log failures. Failure
      // does NOT bubble up — the invitation row exists and the response
      // already contains acceptUrl, so the caller can resend out-of-band.
      await sendInvitationEmail(
        {
          to: inv.email,
          orgName,
          inviterName: inviter?.name ?? null,
          inviterEmail: inviter?.email ?? "",
          role: inv.role,
          acceptUrl,
          expiresAt: inv.expiresAt,
        },
        req.log,
      );

      req.auditAction = "invitation.created";
      req.auditResource = `invitation:${inv.id}`;
      reply.code(201);
      return {
        id: inv.id,
        orgId: inv.orgId,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt.toISOString(),
        createdAt: inv.createdAt.toISOString(),
        token,
        acceptUrl,
      };
    },
  );

  app.get(
    "",
    {
      schema: {
        tags: ["Invitations"],
        operationId: "listInvitations",
        summary: "List pending invitations",
        description:
          "Returns invitations for the resolved org that haven't been accepted or revoked.",
        headers: orgReadHeaders,
        response: { 200: ListResponse, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin"] },
      },
    },
    async (req) => {
      const caller = req.caller;
      const isMaster = caller.type === "master";
      const userId = caller.type === "user" ? caller.userId : null;
      const rows = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster, userId },
        (tx) =>
          tx.invitation.findMany({
            where: { orgId: req.tenantId!, acceptedAt: null, revokedAt: null },
            orderBy: { createdAt: "desc" },
          }),
      );
      req.auditAction = "invitations.list";
      return {
        items: rows.map((r) => ({
          id: r.id,
          orgId: r.orgId,
          email: r.email,
          role: r.role,
          expiresAt: r.expiresAt.toISOString(),
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  );
};

export default invitationRoutes;

/**
 * Mounted at /v1/invitations (no org scoping). The invitee already has a
 * Better Auth session; they POST {token} and we materialise the membership
 * after checking the token + email match.
 */
export const invitationAcceptRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/accept",
    {
      schema: {
        tags: ["Invitations"],
        operationId: "acceptInvitation",
        summary: "Accept an invitation",
        description:
          "Exchanges an invitation token for a membership. The caller's email must match the email on the invitation.",
        headers: userWriteHeaders,
        body: InvitationAccept,
        response: { 200: Membership, ...errorResponses(400, 401, 403, 404, 409, 429, 500) },
      },
      config: { allowedCallers: ["user"] },
    },
    async (req) => {
      const caller = req.caller;
      if (caller.type !== "user") throw Errors.forbidden();
      const tokenHash = crypto.createHash("sha256").update(req.body.token).digest("hex");

      const created = await withTenant(
        app.prisma,
        { orgId: null, isMaster: true, userId: caller.userId },
        async (tx) => {
          const inv = await tx.invitation.findFirst({ where: { tokenHash } });
          if (!inv) throw Errors.notFound("Invitation not found");
          if (inv.acceptedAt) throw Errors.conflict("Invitation already accepted");
          if (inv.revokedAt) throw Errors.conflict("Invitation has been revoked");
          if (inv.expiresAt.getTime() < Date.now()) throw Errors.conflict("Invitation has expired");
          if (inv.email.toLowerCase() !== caller.email.toLowerCase()) {
            throw Errors.forbidden("This invitation is for a different email address");
          }

          // Materialise the membership and mark the invitation accepted in
          // one transaction so a duplicate accept can never create two rows.
          const membership = await tx.orgMembership
            .upsert({
              where: { orgId_userId: { orgId: inv.orgId, userId: caller.userId } },
              update: { role: inv.role, deletedAt: null },
              create: { orgId: inv.orgId, userId: caller.userId, role: inv.role },
            });
          await tx.invitation.update({
            where: { id: inv.id },
            data: { acceptedAt: new Date() },
          });
          return membership;
        },
      );

      req.auditAction = "invitation.accepted";
      req.auditResource = `invitation:${created.id}`;
      return {
        id: created.id,
        orgId: created.orgId,
        userId: created.userId,
        role: created.role,
        createdAt: created.createdAt.toISOString(),
      };
    },
  );
};
