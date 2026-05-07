import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { createReviewAction, publishReviewAction } from "./actions";

export default async function ReviewsPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const [data, employees, me] = await Promise.all([
    api.reviews.list({ limit: 100 }),
    api.employees.list({ limit: 200 }),
    api.me.get(),
  ]);
  const empById = new Map(employees.items.map((e) => [e.id, e]));

  return (
    <div className="p-8 sm:p-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Performance review cycles. Drafts are private to the reviewer until published.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>New review (draft)</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createReviewAction} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="employeeId">Employee</Label>
              <Select id="employeeId" name="employeeId" required defaultValue="">
                <option value="" disabled>Select employee</option>
                {employees.items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="reviewerId">Reviewer</Label>
              <Input
                id="reviewerId"
                name="reviewerId"
                defaultValue={me?.id ?? ""}
                placeholder="user id"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodStart">Period start</Label>
              <Input id="periodStart" name="periodStart" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodEnd">Period end</Label>
              <Input id="periodEnd" name="periodEnd" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rating">Rating (1-5, optional)</Label>
              <Select id="rating" name="rating" defaultValue="">
                <option value="">—</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="summary">Summary</Label>
              <Input id="summary" name="summary" placeholder="One-line summary of the period" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Create draft</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-base font-semibold mb-3">All reviews</h2>
        {data.items.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No reviews yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Period</TH>
                  <TH>Rating</TH>
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
                      <TD>{r.periodStart} → {r.periodEnd}</TD>
                      <TD>{r.rating ?? "—"}</TD>
                      <TD className="capitalize">{r.status}</TD>
                      <TD className="text-right">
                        {r.status === "draft" ? (
                          <form action={publishReviewAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <Button size="sm" type="submit">Publish</Button>
                          </form>
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
