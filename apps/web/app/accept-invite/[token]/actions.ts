"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getApiClient } from "@/lib/api";
import { setActiveOrgIdCookie } from "@/lib/active-org";
import { MyHRError } from "@myhr/sdk";

export async function acceptInvitationAction(
  token: string,
): Promise<{ error: string } | void> {
  const api = await getApiClient();
  if (!api) redirect(`/login?next=${encodeURIComponent(`/accept-invite/${token}`)}`);

  try {
    const membership = await api.invitations.accept(token);
    await setActiveOrgIdCookie(membership.orgId);
    revalidatePath("/overview");
  } catch (err) {
    if (err instanceof MyHRError) return { error: err.message };
    throw err;
  }
  redirect("/overview");
}
