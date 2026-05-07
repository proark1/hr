import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getApiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createOrgAction } from "../(app)/actions";

// /onboarding lives outside the /(app) route group on purpose. The (app)
// layout fetches /v1/me/orgs and redirects to /onboarding when the caller
// has none — if onboarding sat under that layout, fresh users would hit an
// infinite redirect loop. Auth + org-already-exists checks run inline here.
export default async function OnboardingPage() {
  const session = await getSession();
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
          <CardTitle>Welcome to OurTeamManagement</CardTitle>
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
