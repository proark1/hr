"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getApiClient } from "@/lib/api";
import { MyHRError } from "@myhr/sdk";

const TYPES = ["contract", "offer_letter", "id_document", "policy", "certificate", "other"] as const;

export async function createDocumentAction(formData: FormData): Promise<void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const type = String(formData.get("type") ?? "other");
  if (!TYPES.includes(type as (typeof TYPES)[number])) throw new Error("Pick a type");

  const employeeId = String(formData.get("employeeId") ?? "");
  const fileUrl = String(formData.get("fileUrl") ?? "");
  const expiresAt = String(formData.get("expiresAt") ?? "");

  try {
    await api.documents.create({
      name: String(formData.get("name") ?? ""),
      type: type as (typeof TYPES)[number],
      ...(employeeId ? { employeeId } : {}),
      ...(fileUrl ? { fileUrl } : {}),
      ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      ...(formData.get("notes") ? { notes: String(formData.get("notes")) } : {}),
    });
  } catch (err) {
    if (err instanceof MyHRError) throw new Error(err.message);
    throw err;
  }
  revalidatePath("/documents");
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const api = await getApiClient();
  if (!api) redirect("/login");
  await api.documents.delete(String(formData.get("id") ?? ""));
  revalidatePath("/documents");
}
