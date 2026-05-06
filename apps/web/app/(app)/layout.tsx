import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getApiClient } from "@/lib/api";
import { getActiveOrgIdCookie, setActiveOrgIdCookie } from "@/lib/active-org";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const api = await getApiClient();
  if (!api) redirect("/login");

  // Hydrate user from /v1/me — the JWT carries identity but the API layer
  // may have additional fields (e.g. flags) we want to render.
  const me = await api.me.get();
  const myOrgs = await api.me.listMyOrgs();

  // First-run users have no orgs; bounce to onboarding.
  if (myOrgs.items.length === 0) redirect("/onboarding");

  // If the active-org cookie is unset or points to an org the user no longer
  // belongs to, default to the first one.
  let activeOrgId = await getActiveOrgIdCookie();
  if (!activeOrgId || !myOrgs.items.some((m) => m.org.id === activeOrgId)) {
    activeOrgId = myOrgs.items[0]!.org.id;
    await setActiveOrgIdCookie(activeOrgId);
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar
        user={{ name: me.name, email: me.email, isSuperAdmin: me.isSuperAdmin }}
        orgs={myOrgs.items.map((m) => ({ id: m.org.id, name: m.org.name }))}
        activeOrgId={activeOrgId}
      />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
