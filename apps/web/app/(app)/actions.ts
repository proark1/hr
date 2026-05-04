"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setActiveOrgIdCookie } from "@/lib/active-org";
import { getApiClient } from "@/lib/api";

export async function switchOrgAction(formData: FormData): Promise<void> {
  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return;
  await setActiveOrgIdCookie(orgId);
  revalidatePath("/", "layout");
}

export async function createOrgAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const region = String(formData.get("region") ?? "eu");
  if (!name) return;

  const api = await getApiClient();
  if (!api) redirect("/login");

  const org = await api.orgs.create({
    name,
    region: region === "us" ? "us" : "eu",
  });

  await setActiveOrgIdCookie(org.id);
  redirect("/overview");
}
