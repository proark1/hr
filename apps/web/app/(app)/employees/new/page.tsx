import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createEmployeeAction } from "./actions";

export default function NewEmployeePage() {
  return (
    <div className="p-8 sm:p-10 max-w-2xl">
      <div className="mb-6">
        <Link href="/employees" className="text-sm text-muted-foreground underline">
          ← Back to employees
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add employee</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createEmployeeAction} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" name="firstName" required />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" name="lastName" required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job title</Label>
              <Input id="jobTitle" name="jobTitle" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input id="department" name="department" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select id="country" name="country" defaultValue="de" required>
                <option value="de">Germany</option>
                <option value="us">United States</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" name="startDate" type="date" required />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit">Create employee</Button>
              <Button type="reset" variant="outline">Reset</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
