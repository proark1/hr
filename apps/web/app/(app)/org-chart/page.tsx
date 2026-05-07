import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import type { OrgChartNode } from "@myhr/sdk";

function Node({ n }: { n: OrgChartNode }) {
  return (
    <li className="ml-4 border-l border-border pl-4 py-2">
      <div>
        <span className="font-medium">{n.firstName} {n.lastName}</span>
        {n.jobTitle ? (
          <span className="text-muted-foreground"> — {n.jobTitle}</span>
        ) : null}
        {n.department ? (
          <span className="text-xs text-muted-foreground ml-2">[{n.department}]</span>
        ) : null}
      </div>
      {n.reports.length > 0 ? (
        <ul>
          {n.reports.map((c) => <Node key={c.id} n={c} />)}
        </ul>
      ) : null}
    </li>
  );
}

export default async function OrgChartPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");
  const chart = await api.orgChart.get();

  return (
    <div className="p-8 sm:p-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Org chart</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {chart.total} active employee{chart.total === 1 ? "" : "s"}. Auto-rendered from manager relationships.
        </p>
      </header>

      <Card>
        <CardContent className="py-6">
          {chart.roots.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No employees yet. Add employees and set their managers to populate the chart.
            </p>
          ) : (
            <ul>
              {chart.roots.map((r) => <Node key={r.id} n={r} />)}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
