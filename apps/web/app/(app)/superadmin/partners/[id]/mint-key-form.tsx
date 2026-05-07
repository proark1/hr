"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createPartnerKeyAction } from "../actions";

export function MintKeyForm({ partnerId }: { partnerId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    setCreated(null);
    setPending(true);
    const res = await createPartnerKeyAction(partnerId, formData);
    setPending(false);
    if (res?.error) setError(res.error);
    if (res?.key) setCreated(res.key);
  }

  return (
    <Card>
      <CardContent>
        <form action={action} className="flex items-end gap-3 py-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="name">Key name</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. prod-2026-05"
              required
              maxLength={200}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Minting..." : "Mint key"}
          </Button>
        </form>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        {created ? (
          <div className="mt-4 rounded-[var(--radius-md)] border border-primary/30 bg-primary/5 p-4 text-sm">
            <div className="font-medium mb-1">Key created — copy it now</div>
            <p className="text-muted-foreground mb-2">
              We&apos;ll never show this value again. Hand it to the partner
              out-of-band (1Password, Vault, encrypted email). The
              partner-side change is just swapping the{" "}
              <code className="text-xs">Authorization</code> header value.
            </p>
            <code className="block break-all rounded bg-background p-2 text-xs">
              {created}
            </code>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
