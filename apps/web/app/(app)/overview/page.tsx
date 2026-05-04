import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { StatCard } from "@/components/stat-card";

export default async function OverviewPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const employees = await api.employees.list({ limit: 1 });
  const members = await api.members.list();
  const invitations = await api.invitations.list();

  return (
    <div className="p-8 sm:p-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">A snapshot of your org.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Employees"
          value={employees.items.length === 0 && !employees.nextCursor ? 0 : "—"}
          hint={employees.items.length === 0 ? "No employees yet" : "Active employees"}
          variant="primary"
        />
        <StatCard label="Team members" value={members.items.length} hint="People with login access" />
        <StatCard label="Pending invites" value={invitations.items.length} hint="Sent, not yet accepted" />
        <StatCard label="Open time-off" value={0} hint="Coming soon" />
      </div>

      <section className="rounded-[var(--radius-md)] border border-border bg-card p-6">
        <h2 className="text-base font-semibold tracking-tight">Get started</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground list-disc list-inside">
          <li><a href="/employees/new" className="text-primary underline">Add your first employee</a></li>
          <li><a href="/admin" className="text-primary underline">Invite a teammate</a></li>
          <li><a href="/api-keys" className="text-primary underline">Mint a tenant API key</a> for integrations</li>
        </ul>
      </section>
    </div>
  );
}
