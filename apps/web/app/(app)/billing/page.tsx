import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BillingPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");
  const b = await api.billing.get();

  return (
    <div className="p-8 sm:p-10 space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only snapshot. Self-serve plan changes ship with the Stripe integration.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Plan</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {b.plan ?? <span className="text-base text-muted-foreground">Not set</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Billing mode</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold capitalize">{b.billingMode}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Active employees</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{b.seats.used}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Stripe customer</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {b.stripeCustomerId ? (
              <code className="break-all">{b.stripeCustomerId}</code>
            ) : (
              <span className="text-muted-foreground">No Stripe customer linked.</span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
