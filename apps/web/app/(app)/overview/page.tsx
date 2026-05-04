import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/components/sign-out-button";

export default async function OverviewPage() {
  // Layout already gated this — repeat the call so we can read the user.
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user?.name ?? user?.email}</h1>
        <SignOutButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>You&apos;re signed in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            The dashboard with sidebar, employee list, members, and admin pages
            ships in the next PR.
          </p>
          <p>
            Email: <code>{user?.email}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
