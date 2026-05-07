"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getApiClient } from "@/lib/api";
import { MyHRError } from "@myhr/sdk";

const TYPES = ["vacation", "sick", "personal", "unpaid", "parental"] as const;

export async function createTimeOffAction(formData: FormData): Promise<void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const type = String(formData.get("type") ?? "");
  if (!TYPES.includes(type as (typeof TYPES)[number])) throw new Error("Pick a type");

  try {
    await api.timeOff.create({
      employeeId: String(formData.get("employeeId") ?? ""),
      type: type as (typeof TYPES)[number],
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      ...(formData.get("reason") ? { reason: String(formData.get("reason")) } : {}),
    });
  } catch (err) {
    if (err instanceof MyHRError) throw new Error(err.message);
    throw err;
  }
  revalidatePath("/time-off");
}

export async function decideTimeOffAction(formData: FormData): Promise<void> {
  const api = await getApiClient();
  if (!api) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "approved" && status !== "rejected" && status !== "cancelled") {
    throw new Error("Invalid decision");
  }
  try {
    await api.timeOff.decide(id, { status });
  } catch (err) {
    if (err instanceof MyHRError) throw new Error(err.message);
    throw err;
  }
  revalidatePath("/time-off");
}
