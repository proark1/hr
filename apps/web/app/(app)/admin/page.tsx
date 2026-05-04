import Link from "next/link";
import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function AdminPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const members = await api.members.list();
  const invitations = await api.invitations.list();

  return (
    <div className="p-8 sm:p-10 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground mt-1">Members and pending invitations.</p>
        </div>
        <Button asChild>
          <Link href="/admin/invite">Invite teammate</Link>
        </Button>
      </header>

      <section>
        <h2 className="text-base font-semibold mb-3">Members ({members.items.length})</h2>
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Joined</TH>
              </TR>
            </THead>
            <TBody>
              {members.items.map((m) => (
                <TR key={m.membershipId}>
                  <TD className="font-medium">{m.name ?? "—"}</TD>
                  <TD>{m.email}</TD>
                  <TD className="capitalize">{m.role}</TD>
                  <TD>{new Date(m.joinedAt).toLocaleDateString()}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-3">
          Pending invitations ({invitations.items.length})
        </h2>
        {invitations.items.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No pending invitations.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Expires</TH>
                  <TH>Sent</TH>
                </TR>
              </THead>
              <TBody>
                {invitations.items.map((inv) => (
                  <TR key={inv.id}>
                    <TD className="font-medium">{inv.email}</TD>
                    <TD className="capitalize">{inv.role}</TD>
                    <TD>{new Date(inv.expiresAt).toLocaleDateString()}</TD>
                    <TD>{new Date(inv.createdAt).toLocaleDateString()}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
