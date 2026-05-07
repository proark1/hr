import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { MintKeyForm } from "./mint-key-form";
import { SuspendButton } from "./suspend-button";
import { RevokeKeyButton } from "./revoke-key-button";
import { MyHRError } from "@myhr/sdk";

export default async function PartnerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ firstKey?: string }>;
}) {
  const api = await getApiClient();
  if (!api) redirect("/login");
  const { id } = await params;
  const { firstKey } = await searchParams;

  let partner;
  try {
    partner = await api.partners.get(id);
  } catch (err) {
    if (err instanceof MyHRError && err.status === 404) notFound();
    throw err;
  }
  const keys = await api.partners.keys.list(id);
  const activeKeys = keys.items.filter((k) => !k.revokedAt);
  const revokedKeys = keys.items.filter((k) => k.revokedAt);

  return (
    <div className="p-8 sm:p-10 max-w-4xl space-y-8">
      <header>
        <Link
          href="/superadmin/partners"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to partners
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{partner.name}</h1>
          <span
            className={
              partner.status === "active"
                ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            }
          >
            {partner.status}
          </span>
        </div>
        {partner.contactEmail ? (
          <p className="mt-1 text-sm text-muted-foreground">{partner.contactEmail}</p>
        ) : null}
        {partner.notes ? (
          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
            {partner.notes}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          Partner ID:{" "}
          <code className="rounded bg-muted px-1 py-0.5">{partner.id}</code>
        </p>
      </header>

      {firstKey === "1" && activeKeys.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-primary/30 bg-primary/5 p-4 text-sm">
          <div className="font-medium">Partner created. Mint the first key below.</div>
          <p className="mt-1 text-muted-foreground">
            The plaintext key is shown once. Copy it, then hand it to the
            partner out-of-band (1Password, Vault, encrypted email).
          </p>
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Mint a key</h2>
        <MintKeyForm partnerId={partner.id} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Active keys</h2>
        {activeKeys.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No active keys. Mint one above.
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
                  <TH className="w-24"></TH>
                </TR>
              </THead>
              <TBody>
                {activeKeys.map((k) => (
                  <TR key={k.id}>
                    <TD className="font-medium">{k.name}</TD>
                    <TD>
                      <code className="text-xs">{k.prefix}…</code>
                    </TD>
                    <TD>
                      {k.lastUsedAt
                        ? new Date(k.lastUsedAt).toLocaleString()
                        : "Never"}
                    </TD>
                    <TD>{new Date(k.createdAt).toLocaleDateString()}</TD>
                    <TD>
                      <RevokeKeyButton partnerId={partner.id} keyId={k.id} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </section>

      {revokedKeys.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-muted-foreground">
            Revoked keys
          </h2>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Prefix</TH>
                  <TH>Revoked</TH>
                </TR>
              </THead>
              <TBody>
                {revokedKeys.map((k) => (
                  <TR key={k.id} className="text-muted-foreground">
                    <TD>{k.name}</TD>
                    <TD>
                      <code className="text-xs">{k.prefix}…</code>
                    </TD>
                    <TD>
                      {k.revokedAt
                        ? new Date(k.revokedAt).toLocaleDateString()
                        : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </section>
      ) : null}

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground max-w-md">
              {partner.status === "active"
                ? "Suspending blocks every key for this partner at auth time. Their orgs are unaffected. Reversible."
                : "Reactivating restores authentication for every non-revoked key."}
            </div>
            <SuspendButton partnerId={partner.id} status={partner.status} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
