"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getApiClient } from "@/lib/api";
import { MyHRError, type OrgSettingsUpdate } from "@myhr/sdk";

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const update: OrgSettingsUpdate = {};

  const defaultCountry = String(formData.get("defaultCountry") ?? "").trim();
  update.defaultCountry = defaultCountry === "" ? null : defaultCountry;

  const wso = formData.get("weekStartsOn");
  if (wso !== null) update.weekStartsOn = Number(wso);

  const fy = formData.get("fiscalYearStartMonth");
  if (fy !== null) update.fiscalYearStartMonth = Number(fy);

  for (const k of ["dateFormat", "timezone", "locale"] as const) {
    const v = formData.get(k);
    if (v !== null) {
      const s = String(v).trim();
      if (s !== "") update[k] = s;
    }
  }

  try {
    await api.settings.update(update);
  } catch (err) {
    if (err instanceof MyHRError) throw new Error(err.message);
    throw err;
  }
  revalidatePath("/settings");
}
