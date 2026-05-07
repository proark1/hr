"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setPartnerStatusAction } from "../actions";

export function SuspendButton({
  partnerId,
  status,
}: {
  partnerId: string;
  status: "active" | "suspended";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const next = status === "active" ? "suspended" : "active";
  const label = status === "active" ? "Suspend partner" : "Reactivate partner";
  const confirmText =
    status === "active"
      ? "Suspend this partner? Every key will stop authenticating immediately."
      : "Reactivate this partner? All non-revoked keys will work again.";

  function onClick() {
    if (!window.confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      const res = await setPartnerStatusAction(partnerId, next);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={status === "active" ? "destructive" : "default"}
        disabled={pending}
        onClick={onClick}
      >
        {pending ? "Working..." : label}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
