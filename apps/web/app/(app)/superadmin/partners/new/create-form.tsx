"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createPartnerAction } from "../actions";

export function CreatePartnerForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    setPending(true);
    const res = await createPartnerAction(formData);
    setPending(false);
    // On success the action redirects to the detail page so the operator
    // can mint the first key right away. We only land back here on error.
    if (res?.error) setError(res.error);
  }

  return (
    <Card>
      <CardContent>
        <form action={action} className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">Partner name</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. OneTap.ai"
              required
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              Shown in your dashboard and audit log. Not visible to the partner.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact email (optional)</Label>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              placeholder="ops@onetap.ai"
            />
            <p className="text-xs text-muted-foreground">
              Whoever to reach for rotation, suspension, or incident
              coordination on the partner side.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              name="notes"
              placeholder="Pricing tier, contract URL, anything internal."
              maxLength={2000}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create partner"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
