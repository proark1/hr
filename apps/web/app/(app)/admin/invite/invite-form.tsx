"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createInvitationAction } from "./actions";

export function InviteForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    setAcceptUrl(null);
    setPending(true);
    const res = await createInvitationAction(formData);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (res?.acceptUrl) setAcceptUrl(res.acceptUrl);
  }

  return (
    <>
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-muted-foreground underline">
          ← Back to admin
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Invite teammate</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select id="role" name="role" defaultValue="member" required>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="member">Member</option>
              </Select>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Sending..." : "Send invitation"}
            </Button>
          </form>

          {acceptUrl ? (
            <div className="mt-6 rounded-[var(--radius-md)] border border-primary/30 bg-primary/5 p-4 text-sm">
              <div className="font-medium mb-1">Invite created</div>
              <p className="text-muted-foreground">
                Email delivery isn&apos;t wired yet. Copy this link and send it to the invitee:
              </p>
              <code className="mt-2 block break-all rounded bg-background p-2 text-xs">{acceptUrl}</code>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
