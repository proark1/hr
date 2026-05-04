"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getApiClient } from "@/lib/api";
import { MyHRError } from "@myhr/sdk";

export async function createApiKeyAction(
  formData: FormData,
): Promise<{ error?: string; key?: string } | void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  try {
    const created = await api.apiKeys.create({
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath("/api-keys");
    return { key: created.key };
  } catch (err) {
    if (err instanceof MyHRError) return { error: err.message };
    throw err;
  }
}
