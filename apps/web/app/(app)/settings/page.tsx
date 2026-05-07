import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateSettingsAction } from "./actions";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function SettingsPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");
  const s = await api.settings.get();

  return (
    <div className="p-8 sm:p-10 space-y-6 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tenant-wide defaults: locale, timezone, week and fiscal year start.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Workspace defaults</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateSettingsAction} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultCountry">Default country (ISO-3166-1 alpha-2)</Label>
              <Input id="defaultCountry" name="defaultCountry" maxLength={2} defaultValue={s.defaultCountry ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="locale">Locale</Label>
              <Input id="locale" name="locale" defaultValue={s.locale} placeholder="en-US" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue={s.timezone} placeholder="UTC" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateFormat">Date format</Label>
              <Input id="dateFormat" name="dateFormat" defaultValue={s.dateFormat} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weekStartsOn">Week starts on</Label>
              <Select id="weekStartsOn" name="weekStartsOn" defaultValue={String(s.weekStartsOn)}>
                {WEEKDAYS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscalYearStartMonth">Fiscal year starts</Label>
              <Select id="fiscalYearStartMonth" name="fiscalYearStartMonth" defaultValue={String(s.fiscalYearStartMonth)}>
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </Select>
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
