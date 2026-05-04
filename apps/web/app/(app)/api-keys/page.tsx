import Link from "next/link";
import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CreateApiKeyForm } from "./create-form";

export default async function ApiKeysPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const keys = await api.apiKeys.list();

  return (
    <div className="p-8 sm:p-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tenant-scoped keys for integrations. The plaintext value is shown once.
        </p>
      </header>

      <CreateApiKeyForm />

      <section>
        <h2 className="text-base font-semibold mb-3">Active keys</h2>
        {keys.items.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No keys yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Prefix</TH>
                  <TH>Last used</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {keys.items.map((k) => (
                  <TR key={k.id}>
                    <TD className="font-medium">{k.name}</TD>
                    <TD><code className="text-xs">{k.prefix}…</code></TD>
                    <TD>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}</TD>
                    <TD>{new Date(k.createdAt).toLocaleDateString()}</TD>
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
