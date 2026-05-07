"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createWebhookAction } from "./actions";

const EVENTS = [
  "employee.created",
  "employee.updated",
  "employee.deleted",
  "document.expiring",
] as const;

export function CreateWebhookForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    setSecret(null);
    setPending(true);
    const res = await createWebhookAction(formData);
    setPending(false);
    if (res?.error) setError(res.error);
    if (res?.secret) setSecret(res.secret);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register endpoint</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">URL (https only)</Label>
            <Input id="url" name="url" type="url" placeholder="https://api.example.com/myhr-webhook" required />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Events</legend>
            <div className="grid grid-cols-2 gap-2">
              {EVENTS.map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="events" value={e} defaultChecked />
                  <code className="text-xs">{e}</code>
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={pending}>
            {pending ? "Registering..." : "Register"}
          </Button>
        </form>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        {secret ? (
          <div className="mt-4 rounded-[var(--radius-md)] border border-primary/30 bg-primary/5 p-4 text-sm">
            <div className="font-medium mb-1">Signing secret — copy now</div>
            <p className="text-muted-foreground mb-2">
              Use this to verify the <code className="text-xs">Webhook-Signature</code> header. We won&apos;t show it again.
            </p>
            <code className="block break-all rounded bg-background p-2 text-xs">{secret}</code>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
