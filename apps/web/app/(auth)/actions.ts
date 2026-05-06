"use server";
import { redirect } from "next/navigation";
import {
  AuthServiceError,
  login as authLogin,
  register as authRegister,
  requestPasswordReset as authRequestPasswordReset,
  resendVerification as authResendVerification,
  resetPassword as authResetPassword,
  verifyEmail as authVerifyEmail,
} from "@/lib/auth-service";
import { endSession, setSessionCookies } from "@/lib/session";

export type AuthFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "mfa"; message: string }
  | { status: "ok"; message: string };

function safeNext(value: string | null): string {
  if (!value) return "/overview";
  // Only allow internal paths to prevent open-redirects.
  if (!value.startsWith("/") || value.startsWith("//")) return "/overview";
  return value;
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email || !password) {
    return { status: "error", message: "Email and password are required." };
  }

  let result;
  try {
    result = await authLogin(email, password);
  } catch (err) {
    if (err instanceof AuthServiceError) {
      return {
        status: "error",
        message: err.status === 401 ? "Invalid email or password." : err.message,
      };
    }
    return { status: "error", message: "Sign-in failed. Please try again." };
  }

  if (result.kind === "mfa") {
    return {
      status: "mfa",
      message: "MFA is required. Multi-factor login is not yet supported in the dashboard.",
    };
  }

  await setSessionCookies(result.tokens);
  redirect(next);
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { status: "error", message: "Email and password are required." };
  }

  try {
    await authRegister(email, password, name || undefined);
  } catch (err) {
    if (err instanceof AuthServiceError) {
      // 409 = email already registered. Tell the user explicitly so they
      // don't keep waiting for a verification email that won't arrive.
      if (err.status === 409 || err.code === "email_taken") {
        return {
          status: "error",
          message:
            "This email is already registered. Sign in instead, or use 'Forgot password' if you don't remember it.",
        };
      }
      return { status: "error", message: err.message };
    }
    return { status: "error", message: "Sign-up failed. Please try again." };
  }

  return {
    status: "ok",
    message: "Account created. Check your email to verify your address, then sign in.",
  };
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/");
}

export async function verifyEmailAction(token: string): Promise<AuthFormState> {
  if (!token) return { status: "error", message: "Missing verification token." };
  try {
    await authVerifyEmail(token);
  } catch (err) {
    if (err instanceof AuthServiceError) {
      // 400/410 typically means the token expired or was already used.
      const expired = err.status === 400 || err.status === 410;
      return {
        status: "error",
        message: expired
          ? "This verification link has expired or has already been used."
          : err.message,
      };
    }
    return { status: "error", message: "We couldn't verify your email. Please try again." };
  }
  return { status: "ok", message: "Email verified. You can now sign in." };
}

export async function resendVerificationAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { status: "error", message: "Enter your email address." };
  try {
    await authResendVerification(email);
  } catch {
    // Always return success to avoid leaking whether the email exists.
  }
  return {
    status: "ok",
    message: "If that email is registered, we just sent a new verification link.",
  };
}

export async function forgotPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { status: "error", message: "Enter your email address." };
  try {
    await authRequestPasswordReset(email);
  } catch {
    // Same enumeration-resistance posture as resend.
  }
  return {
    status: "ok",
    message: "If that email is registered, we just sent a password reset link.",
  };
}

export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!token) return { status: "error", message: "Missing reset token." };
  if (!password || password.length < 8) {
    return { status: "error", message: "Password must be at least 8 characters." };
  }
  try {
    await authResetPassword(token, password);
  } catch (err) {
    if (err instanceof AuthServiceError) {
      const expired = err.status === 400 || err.status === 410;
      return {
        status: "error",
        message: expired
          ? "This reset link has expired or has already been used."
          : err.message,
      };
    }
    return { status: "error", message: "We couldn't reset your password. Please try again." };
  }
  return { status: "ok", message: "Password updated. You can now sign in with your new password." };
}
