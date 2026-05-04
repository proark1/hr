import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
      <div className="max-w-2xl">
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
          HR for startups, built API-first.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          Hire, onboard, manage employees, contracts and time off — and stay GDPR-compliant
          out of the box. Use the dashboard, the REST API, or our MCP server for AI agents.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/signup">Create your account</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/login">I already have one</Link>
          </Button>
        </div>
      </div>

      <div className="mt-20 grid sm:grid-cols-3 gap-6">
        {[
          { title: "API-first", body: "Every screen is just a thin layer on top of a typed REST API. Build integrations or AI agents on the same surface." },
          { title: "EU + GDPR-ready", body: "Hosted in Frankfurt. Right-to-access export, right-to-erasure, full audit log — built in, not bolted on." },
          { title: "Multi-tenant", body: "Postgres row-level security, FORCE'd. Even buggy code can't escape the tenant. We sleep at night so you can." },
        ].map((f) => (
          <div key={f.title} className="rounded-[var(--radius-md)] border border-border bg-card p-6">
            <div className="text-sm font-semibold tracking-tight">{f.title}</div>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
