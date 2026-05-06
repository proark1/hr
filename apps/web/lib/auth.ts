/**
 * Compatibility shim — previously this exported a Better Auth instance. Now
 * the web app delegates identity to the external auth service
 * (proark1/auth) and keeps its own session state in httpOnly cookies. Use
 * the helpers in `./session` for everything auth-related.
 */
export {
  getSession,
  endSession,
  setSessionCookies,
  clearSessionCookies,
  type Session,
  type SessionUser,
} from "./session";
