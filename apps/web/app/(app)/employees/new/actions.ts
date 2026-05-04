"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getApiClient } from "@/lib/api";

export async function createEmployeeAction(formData: FormData): Promise<void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const country = String(formData.get("country") ?? "");
  if (country !== "us" && country !== "de") {
    throw new Error("Pick a country");
  }

  await api.employees.create({
    email: String(formData.get("email") ?? ""),
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    country,
    startDate: String(formData.get("startDate") ?? ""),
    status: "onboarding",
    ...(formData.get("jobTitle") ? { jobTitle: String(formData.get("jobTitle")) } : {}),
    ...(formData.get("department") ? { department: String(formData.get("department")) } : {}),
  });

  revalidatePath("/employees");
  redirect("/employees");
}
