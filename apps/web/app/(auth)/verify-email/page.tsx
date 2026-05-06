import Link from "next/link";
import { Suspense } from "react";
import { verifyEmailAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SearchParams = { token?: string };

async function VerifyEmail({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { token } = await searchParams;
  const state = await verifyEmailAction(token ?? "");

  if (state.status === "ok") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email verified</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{state.message}</p>
          <Button asChild className="w-full">
            <Link href="/login">Continue to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verification failed</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-destructive">
          {state.status === "error" ? state.message : "Unknown error."}
        </p>
        <p className="text-sm text-muted-foreground">
          You can request a new verification email from the{" "}
          <Link href="/login" className="underline">
            sign-in page
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Verifying email…</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">One moment.</p>
          </CardContent>
        </Card>
      }
    >
      <VerifyEmail searchParams={searchParams} />
    </Suspense>
  );
}
