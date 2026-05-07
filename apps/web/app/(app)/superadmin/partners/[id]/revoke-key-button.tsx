"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revokePartnerKeyAction } from "../actions";

export function RevokeKeyButton({
  partnerId,
  keyId,
}: {
  partnerId: string;
  keyId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (
      !window.confirm(
        "Revoke this key? Subsequent requests using it will fail with 401. The action is irreversible.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await revokePartnerKeyAction(partnerId, keyId);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={onClick}
      >
        {pending ? "Revoking..." : "Revoke"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
