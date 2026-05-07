import Link from "next/link";
import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

// Cross-tenant superadmin view. Only visible to users with isSuperAdmin=true
// (the API enforces this via requireSuperAdmin on the route; the sidebar
// link is also gated client-side).
export default async function SuperAdminPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const { items } = await api.superadmin.listOrgs({ limit: 100 });

  return (
    <div className="p-8 sm:p-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Super Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">All tenants on the platform.</p>
      </header>

      <nav className="flex gap-3 border-b text-sm">
        <span className="px-1 pb-2 -mb-px border-b-2 border-foreground font-medium">
          Orgs
        </span>
        <Link
          href="/superadmin/partners"
          className="px-1 pb-2 text-muted-foreground hover:text-foreground"
        >
          Partners
        </Link>
      </nav>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Region</TH>
              <TH>Status</TH>
              <TH>Created</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((o) => (
              <TR key={o.id}>
                <TD className="font-medium">{o.name}</TD>
                <TD>{o.region.toUpperCase()}</TD>
                <TD className="capitalize">{o.status}</TD>
                <TD>{new Date(o.createdAt).toLocaleDateString()}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {items.length === 0 ? (
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No orgs yet.
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
