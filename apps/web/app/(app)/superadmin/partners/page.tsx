import Link from "next/link";
import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

// Cross-tenant Partners admin. Only visible to users with isSuperAdmin=true.
// API enforces auth via requireSuperAdmin on /v1/partners*; the sidebar
// link is also gated client-side.
export default async function PartnersPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const { items } = await api.partners.list({ limit: 200 });

  return (
    <div className="p-8 sm:p-10 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Partners</h1>
          <p className="text-sm text-muted-foreground mt-1">
            External integrators that provision HR orgs for their own
            customers. Each partner has their own API keys, sees only their
            own orgs, and can be suspended or revoked independently.
          </p>
        </div>
        <Link href="/superadmin/partners/new">
          <Button>New partner</Button>
        </Link>
      </header>

      <nav className="flex gap-3 border-b text-sm">
        <Link
          href="/superadmin"
          className="px-1 pb-2 text-muted-foreground hover:text-foreground"
        >
          Orgs
        </Link>
        <span className="px-1 pb-2 -mb-px border-b-2 border-foreground font-medium">
          Partners
        </span>
      </nav>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No partners yet. Create one to onboard your first integrator.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>Contact</TH>
                <TH>Created</TH>
                <TH className="w-24"></TH>
              </TR>
            </THead>
            <TBody>
              {items.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{p.name}</TD>
                  <TD>
                    <span
                      className={
                        p.status === "active"
                          ? "text-green-700 capitalize"
                          : "text-amber-700 capitalize"
                      }
                    >
                      {p.status}
                    </span>
                  </TD>
                  <TD className="text-sm">{p.contactEmail ?? "—"}</TD>
                  <TD>{new Date(p.createdAt).toLocaleDateString()}</TD>
                  <TD>
                    <Link
                      href={`/superadmin/partners/${p.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      Manage →
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
