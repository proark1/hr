import { cookies } from "next/headers";

const COOKIE_NAME = "active_org";

export async function getActiveOrgIdCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value;
}

export async function setActiveOrgIdCookie(orgId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function clearActiveOrgIdCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
