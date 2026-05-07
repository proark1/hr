"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getApiClient } from "@/lib/api";
import { MyHRError } from "@myhr/sdk";

export async function createPartnerAction(
  formData: FormData,
): Promise<{ error?: string; id?: string } | void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  try {
    const created = await api.partners.create({
      name,
      contactEmail: contactEmail || undefined,
      notes: notes || undefined,
    });
    revalidatePath("/superadmin/partners");
    // Redirect to the detail page where the operator immediately mints
    // the first key (and where the plaintext is shown once).
    redirect(`/superadmin/partners/${created.id}?firstKey=1`);
  } catch (err) {
    if (err instanceof MyHRError) return { error: err.message };
    throw err;
  }
}

export async function createPartnerKeyAction(
  partnerId: string,
  formData: FormData,
): Promise<{ error?: string; key?: string } | void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();

  try {
    const created = await api.partners.keys.create(partnerId, { name });
    revalidatePath(`/superadmin/partners/${partnerId}`);
    return { key: created.key };
  } catch (err) {
    if (err instanceof MyHRError) return { error: err.message };
    throw err;
  }
}

export async function revokePartnerKeyAction(
  partnerId: string,
  keyId: string,
): Promise<{ error?: string } | void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  try {
    await api.partners.keys.revoke(partnerId, keyId);
    revalidatePath(`/superadmin/partners/${partnerId}`);
  } catch (err) {
    if (err instanceof MyHRError) return { error: err.message };
    throw err;
  }
}

export async function setPartnerStatusAction(
  partnerId: string,
  status: "active" | "suspended",
): Promise<{ error?: string } | void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  try {
    await api.partners.update(partnerId, { status });
    revalidatePath(`/superadmin/partners/${partnerId}`);
    revalidatePath("/superadmin/partners");
  } catch (err) {
    if (err instanceof MyHRError) return { error: err.message };
    throw err;
  }
}
