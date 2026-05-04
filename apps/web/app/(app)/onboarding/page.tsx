import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getApiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createOrgAction } from "../actions";

// /onboarding is its own route (not behind /(app)/layout) because the layout
// fetches /v1/me/orgs and would redirect right back here. The onboarding
// flow itself does the auth check inline.
export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // If the user already has an org, send them to the dashboard.
  const api = await getApiClient();
  if (api) {
    const myOrgs = await api.me.listMyOrgs();
    if (myOrgs.items.length > 0) redirect("/overview");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to MyHR</CardTitle>
          <CardDescription>Set up your first org to get started.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createOrgAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization name</Label>
              <Input id="name" name="name" required minLength={1} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Select id="region" name="region" defaultValue="eu">
                <option value="eu">EU</option>
                <option value="us">US</option>
              </Select>
            </div>
            <Button type="submit" className="w-full">
              Create org
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
