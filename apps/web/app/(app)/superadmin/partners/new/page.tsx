import Link from "next/link";
import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { CreatePartnerForm } from "./create-form";

export default async function NewPartnerPage() {
  // Just gate access; the form itself is client-side and posts via a
  // server action. Putting the auth check here means an unauthenticated
  // user gets redirected to login before they ever see the form.
  const api = await getApiClient();
  if (!api) redirect("/login");

  return (
    <div className="p-8 sm:p-10 max-w-2xl space-y-6">
      <header>
        <Link
          href="/superadmin/partners"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to partners
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New partner</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Creates the partner record. You&apos;ll mint the first API key on the
          next page — the plaintext value is shown once.
        </p>
      </header>

      <CreatePartnerForm />
    </div>
  );
}
