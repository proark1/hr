"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Error boundary for the /superadmin/* tree. Catches anything that escapes
 * the layout's auth gate and the page-level try/catch — typically
 * transient API errors. Replaces the framework's generic "Application
 * error" with something operators can actually act on (and a way back).
 */
export default function SuperAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Super admin route error", error);
  }, [error]);

  return (
    <div className="p-8 sm:p-10 max-w-2xl">
      <Card>
        <CardContent className="space-y-4 py-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The Super Admin page failed to load. The most common cause is a
            stale session — sign out and back in to refresh your auth claims.
            If the problem persists, check the API service logs.
          </p>
          {error.digest ? (
            <p className="text-xs text-muted-foreground">
              Error reference:{" "}
              <code className="rounded bg-muted px-1 py-0.5">{error.digest}</code>
            </p>
          ) : null}
          <div className="flex gap-2 pt-2">
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" asChild>
              <Link href="/overview">Back to overview</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
