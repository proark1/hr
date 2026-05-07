import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CreateWebhookForm } from "./create-form";
import { deleteWebhookAction } from "./actions";

export default async function WebhooksPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const data = await api.webhookEndpoints.list();

  return (
    <div className="p-8 sm:p-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Receive event deliveries on your URL. Each delivery is signed with HMAC-SHA256.
        </p>
      </header>

      <CreateWebhookForm />

      <section>
        <h2 className="text-base font-semibold mb-3">Endpoints</h2>
        {data.items.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No endpoints registered.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>URL</TH>
                  <TH>Events</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((w) => (
                  <TR key={w.id}>
                    <TD className="font-medium break-all">{w.url}</TD>
                    <TD>
                      <code className="text-xs">{w.events.join(", ")}</code>
                    </TD>
                    <TD>{w.isActive ? "Active" : "Disabled"}</TD>
                    <TD className="text-right">
                      <form action={deleteWebhookAction}>
                        <input type="hidden" name="id" value={w.id} />
                        <Button size="sm" variant="outline" type="submit">Delete</Button>
                      </form>
                    </TD>
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
