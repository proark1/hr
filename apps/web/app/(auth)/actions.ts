"use server";
import { redirect } from "next/navigation";
import {
  AuthServiceError,
  login as authLogin,
  register as authRegister,
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
