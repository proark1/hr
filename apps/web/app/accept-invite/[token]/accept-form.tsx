"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptInvitationAction } from "./actions";

type Props = {
  token: string;
  email: string;
};

export function AcceptInviteForm({ token, email }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onAccept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptInvitationAction(token);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accept invitation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in as <span className="font-medium text-foreground">{email}</span>.
          Accept to join the org.
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button onClick={onAccept} disabled={pending} className="w-full">
          {pending ? "Accepting..." : "Accept invitation"}
        </Button>
      </CardContent>
    </Card>
  );
}
