import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AcceptInviteForm } from "./accept-form";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function AcceptInvitePage({ params }: Props) {
  const { token } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Link href="/" className="text-lg font-semibold tracking-tight mb-6">MyHR</Link>
      <div className="w-full max-w-sm">
        {session ? (
          <AcceptInviteForm token={token} email={session.user.email} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Sign in to accept</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You need a MyHR account to accept this invitation. Sign in or
                create one — make sure to use the email address the invite was
                sent to.
              </p>
              <div className="flex gap-2">
                <Button asChild className="flex-1">
                  <Link href={`/login?next=${encodeURIComponent(`/accept-invite/${token}`)}`}>
                    Sign in
                  </Link>
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link href={`/signup?next=${encodeURIComponent(`/accept-invite/${token}`)}`}>
                    Sign up
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
