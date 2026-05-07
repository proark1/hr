import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { createTimeOffAction, decideTimeOffAction } from "./actions";

export default async function TimeOffPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const [data, employees] = await Promise.all([
    api.timeOff.list({ limit: 100 }),
    api.employees.list({ limit: 200 }),
  ]);
  const empById = new Map(employees.items.map((e) => [e.id, e]));

  return (
    <div className="p-8 sm:p-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Time off</h1>
        <p className="text-sm text-muted-foreground mt-1">
          File a request, then approve, reject, or cancel it.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>New request</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTimeOffAction} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="employeeId">Employee</Label>
              <Select id="employeeId" name="employeeId" required defaultValue="">
                <option value="" disabled>Select employee</option>
                {employees.items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} ({e.email})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select id="type" name="type" defaultValue="vacation" required>
                <option value="vacation">Vacation</option>
                <option value="sick">Sick</option>
                <option value="personal">Personal</option>
                <option value="unpaid">Unpaid</option>
                <option value="parental">Parental</option>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-1" />
            <div className="space-y-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" name="startDate" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" name="endDate" type="date" required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input id="reason" name="reason" placeholder="Family trip" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">File request</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-base font-semibold mb-3">Requests</h2>
        {data.items.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No requests yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Type</TH>
                  <TH>Dates</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((r) => {
                  const emp = empById.get(r.employeeId);
                  return (
                    <TR key={r.id}>
                      <TD className="font-medium">
                        {emp ? `${emp.firstName} ${emp.lastName}` : r.employeeId.slice(0, 8)}
                      </TD>
                      <TD className="capitalize">{r.type}</TD>
                      <TD>{r.startDate} → {r.endDate}</TD>
                      <TD className="capitalize">{r.status}</TD>
                      <TD className="text-right">
                        {r.status === "pending" ? (
                          <div className="flex justify-end gap-1">
                            <form action={decideTimeOffAction}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="status" value="approved" />
                              <Button size="sm" type="submit">Approve</Button>
                            </form>
                            <form action={decideTimeOffAction}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="status" value="rejected" />
                              <Button size="sm" variant="outline" type="submit">Reject</Button>
                            </form>
                          </div>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
