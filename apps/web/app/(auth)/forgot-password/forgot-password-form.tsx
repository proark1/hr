"use client";
import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
      </CardHeader>
      <CardContent>
        {state.status === "ok" ? (
          <p className="text-sm">{state.message}</p>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            {state.status === "error" ? (
              <p className="text-sm text-destructive">{state.message}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <p className="mt-6 text-sm text-muted-foreground text-center">
          Remembered it?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
