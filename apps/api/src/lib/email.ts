import { Resend } from "resend";
import { env } from "../env.js";

let _resend: Resend | null | undefined;

function getResend(): Resend | null {
  if (_resend !== undefined) return _resend;
  _resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  return _resend;
}

type InvitationEmailInput = {
  to: string;
  orgName: string;
  inviterName: string | null;
  inviterEmail: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
};

/**
 * Send an invitation email via Resend. If RESEND_API_KEY is unset we log
 * the payload + accept URL to stdout (useful for dev and for environments
 * where 1tap or another integrator drives the email sending themselves).
 *
 * Failures don't propagate — invitation creation already succeeded by the
 * time we get here, and we don't want a downstream email outage to fail
 * an HTTP request the caller already considers complete.
 */
export async function sendInvitationEmail(
  input: InvitationEmailInput,
  log: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void },
): Promise<void> {
  const inviter = input.inviterName ?? input.inviterEmail;
  const subject = `You've been invited to ${input.orgName} on MyHR`;
  const text = [
    `Hi,`,
    ``,
    `${inviter} invited you to join ${input.orgName} on MyHR as ${input.role}.`,
    ``,
    `Accept the invitation:`,
    input.acceptUrl,
    ``,
    `This link expires on ${input.expiresAt.toUTCString()}.`,
    ``,
    `— MyHR`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h1 style="font-size: 20px; margin: 0 0 16px;">You've been invited to ${escapeHtml(input.orgName)}</h1>
      <p style="font-size: 15px; line-height: 1.5; color: #333;">
        ${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(input.orgName)}</strong>
        on MyHR as a <strong>${escapeHtml(input.role)}</strong>.
      </p>
      <p style="margin: 24px 0;">
        <a href="${input.acceptUrl}"
           style="background:#3a7afe;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:500;">
          Accept invitation
        </a>
      </p>
      <p style="font-size: 13px; color: #666;">
        Or copy this link into your browser:<br />
        <code style="word-break: break-all;">${input.acceptUrl}</code>
      </p>
      <p style="font-size: 12px; color: #999; margin-top: 24px;">
        This invitation expires on ${escapeHtml(input.expiresAt.toUTCString())}.
        If you weren't expecting this, you can safely ignore the email.
      </p>
    </div>
  `;

  const resend = getResend();
  if (!resend || !env.EMAIL_FROM) {
    log.info(
      { to: input.to, subject, acceptUrl: input.acceptUrl },
      "[email] RESEND_API_KEY not set — invitation email skipped (would have sent)",
    );
    return;
  }

  try {
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: [input.to],
      subject,
      text,
      html,
    });
  } catch (err) {
    log.error({ err, to: input.to }, "[email] failed to send invitation email");
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
