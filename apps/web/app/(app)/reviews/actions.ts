"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getApiClient } from "@/lib/api";
import { MyHRError } from "@myhr/sdk";

export async function createReviewAction(formData: FormData): Promise<void> {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const ratingStr = String(formData.get("rating") ?? "");
  const rating = ratingStr ? Number(ratingStr) : undefined;

  try {
    await api.reviews.create({
      employeeId: String(formData.get("employeeId") ?? ""),
      reviewerId: String(formData.get("reviewerId") ?? ""),
      periodStart: String(formData.get("periodStart") ?? ""),
      periodEnd: String(formData.get("periodEnd") ?? ""),
      ...(rating ? { rating } : {}),
      ...(formData.get("summary") ? { summary: String(formData.get("summary")) } : {}),
    });
  } catch (err) {
    if (err instanceof MyHRError) throw new Error(err.message);
    throw err;
  }
  revalidatePath("/reviews");
}

export async function publishReviewAction(formData: FormData): Promise<void> {
  const api = await getApiClient();
  if (!api) redirect("/login");
  await api.reviews.update(String(formData.get("id") ?? ""), { status: "published" });
  revalidatePath("/reviews");
}
