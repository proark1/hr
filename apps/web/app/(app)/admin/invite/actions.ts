"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getApiClient } from "@/lib/api";
import { MyHRError } from "@myhr/sdk";

export async function createInvitationAction(
  formData: FormData,
): Promise<{ error?: string; acceptUrl?: string } | void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const role = String(formData.get("role") ?? "member");
  const validRole = ["owner", "admin", "manager", "member"].includes(role) ? (role as "owner" | "admin" | "manager" | "member") : "member";

  try {
    const inv = await api.invitations.create({
      email: String(formData.get("email") ?? ""),
      role: validRole,
    });
    revalidatePath("/admin");
    // Until Resend is wired, we surface the URL back to the inviter so they
    // can copy/paste it. Future PR sends the email.
    return { acceptUrl: inv.acceptUrl };
  } catch (err) {
    if (err instanceof MyHRError) return { error: err.message };
    throw err;
  }
}
