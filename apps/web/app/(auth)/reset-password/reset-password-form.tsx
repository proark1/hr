"use client";
import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = { status: "idle" };

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid reset link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-destructive">This password reset link is missing its token.</p>
          <p className="text-sm text-muted-foreground">
            Request a new link from the{" "}
            <Link href="/forgot-password" className="underline">
              forgot-password page
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
      </CardHeader>
      <CardContent>
        {state.status === "ok" ? (
          <div className="space-y-4">
            <p className="text-sm">{state.message}</p>
            <Button asChild className="w-full">
              <Link href="/login">Continue to sign in</Link>
            </Button>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {state.status === "error" ? (
              <p className="text-sm text-destructive">{state.message}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
