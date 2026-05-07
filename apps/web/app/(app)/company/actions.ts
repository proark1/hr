"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getApiClient } from "@/lib/api";
import { MyHRError, type CompanyProfileUpdate } from "@myhr/sdk";

const FIELDS = [
  "legalName",
  "displayName",
  "taxId",
  "websiteUrl",
  "supportEmail",
  "logoUrl",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "country",
] as const;

export async function updateCompanyAction(formData: FormData): Promise<void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const update: CompanyProfileUpdate = {};
  for (const k of FIELDS) {
    const v = formData.get(k);
    if (v === null) continue;
    const s = String(v).trim();
    (update as Record<string, string | null>)[k] = s === "" ? null : s;
  }

  try {
    await api.company.update(update);
  } catch (err) {
    if (err instanceof MyHRError) throw new Error(err.message);
    throw err;
  }
  revalidatePath("/company");
}
