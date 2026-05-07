import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { MyHRError } from "@myhr/sdk";

/**
 * Gate the entire /superadmin/* tree at the layout level.
 *
 * Without this, every page does its own API call and any failure (most
 * commonly: the user's JWT doesn't carry `is_super_admin: true`) bubbles
 * up as Next.js's generic 500 error page. Doing the check here means a
 * non-superadmin gets a clean redirect to /overview, and crashes inside
 * the superadmin pages can't reveal anything sensitive.
 *
 * The auth check runs server-side before any child renders, so the
 * sidebar's `superAdminOnly` filter and this gate stay in sync from the
 * same source of truth (`/v1/me`).
 */
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const api = await getApiClient();
  if (!api) redirect("/login");

  let me;
  try {
    me = await api.me.get();
  } catch (err) {
    // 401 = stale session; bounce to login.
    if (err instanceof MyHRError && err.status === 401) redirect("/login");
    // Anything else (5xx, network, the API service is down) is NOT a
    // permissions issue — re-throw so error.tsx can render its
    // "Something went wrong" card. Swallowing here would falsely tell
    // the user they lack access when the real problem is an outage.
    throw err;
  }

  if (me.isSuperAdmin !== true) {
    // Non-admins land here either by typing the URL or following a stale
    // bookmark from a previously-elevated session. Bounce them home;
    // there's no useful page in this tree for them.
    redirect("/overview?reason=not-superadmin");
  }

  return <>{children}</>;
}
