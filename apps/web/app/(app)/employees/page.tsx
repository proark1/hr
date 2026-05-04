import Link from "next/link";
import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

export default async function EmployeesPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const data = await api.employees.list({ limit: 100 });
  const items = data.items;

  return (
    <div className="p-8 sm:p-10 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} record{items.length === 1 ? "" : "s"}</p>
        </div>
        <Button asChild>
          <Link href="/employees/new">Add employee</Link>
        </Button>
      </header>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No employees yet.{" "}
            <Link href="/employees/new" className="text-primary underline">
              Add your first employee
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Title</TH>
                <TH>Country</TH>
                <TH>Status</TH>
                <TH>Start</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((e) => (
                <TR key={e.id}>
                  <TD className="font-medium">{e.firstName} {e.lastName}</TD>
                  <TD>{e.email}</TD>
                  <TD>{e.jobTitle ?? "—"}</TD>
                  <TD>{e.country.toUpperCase()}</TD>
                  <TD>{e.status.replace("_", " ")}</TD>
                  <TD>{e.startDate}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
