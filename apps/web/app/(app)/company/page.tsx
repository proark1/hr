import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateCompanyAction } from "./actions";

export default async function CompanyPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");
  const profile = await api.company.get();

  const f = (v: string | null) => v ?? "";

  return (
    <div className="p-8 sm:p-10 space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Company</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Legal entity, branding, and contact details for this tenant.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateCompanyAction} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="legalName">Legal name</Label>
              <Input id="legalName" name="legalName" defaultValue={f(profile.legalName)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" name="displayName" defaultValue={f(profile.displayName)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">Tax ID</Label>
              <Input id="taxId" name="taxId" defaultValue={f(profile.taxId)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="websiteUrl">Website</Label>
              <Input id="websiteUrl" name="websiteUrl" type="url" defaultValue={f(profile.websiteUrl)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support email</Label>
              <Input id="supportEmail" name="supportEmail" type="email" defaultValue={f(profile.supportEmail)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input id="logoUrl" name="logoUrl" type="url" defaultValue={f(profile.logoUrl)} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="addressLine1">Address line 1</Label>
              <Input id="addressLine1" name="addressLine1" defaultValue={f(profile.addressLine1)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="addressLine2">Address line 2</Label>
              <Input id="addressLine2" name="addressLine2" defaultValue={f(profile.addressLine2)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={f(profile.city)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region / state</Label>
              <Input id="region" name="region" defaultValue={f(profile.region)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal code</Label>
              <Input id="postalCode" name="postalCode" defaultValue={f(profile.postalCode)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country (ISO-3166-1 alpha-2)</Label>
              <Input id="country" name="country" maxLength={2} defaultValue={f(profile.country)} />
            </div>

            <div className="sm:col-span-2">
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
