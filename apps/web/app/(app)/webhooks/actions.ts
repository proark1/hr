"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getApiClient } from "@/lib/api";
import { MyHRError } from "@myhr/sdk";

const EVENTS = [
  "employee.created",
  "employee.updated",
  "employee.deleted",
  "document.expiring",
] as const;

export async function createWebhookAction(
  formData: FormData,
): Promise<{ error?: string; secret?: string } | void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const url = String(formData.get("url") ?? "");
  const selected = formData.getAll("events").map(String) as Array<(typeof EVENTS)[number]>;
  if (selected.length === 0) return { error: "Select at least one event" };

  try {
    const created = await api.webhookEndpoints.create({ url, events: selected });
    revalidatePath("/webhooks");
    return { secret: created.secret };
  } catch (err) {
    if (err instanceof MyHRError) return { error: err.message };
    throw err;
  }
}

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  const api = await getApiClient();
  if (!api) redirect("/login");
  await api.webhookEndpoints.delete(String(formData.get("id") ?? ""));
  revalidatePath("/webhooks");
}

export async function rotateWebhookAction(
  formData: FormData,
): Promise<{ error?: string; secret?: string } | void> {
  const api = await getApiClient();
  if (!api) redirect("/login");
  try {
    const rotated = await api.webhookEndpoints.rotateSecret(String(formData.get("id") ?? ""));
    revalidatePath("/webhooks");
    return { secret: rotated.secret };
  } catch (err) {
    if (err instanceof MyHRError) return { error: err.message };
    throw err;
  }
}
