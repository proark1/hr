import { redirect } from "next/navigation";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { createDocumentAction, deleteDocumentAction } from "./actions";

export default async function DocumentsPage() {
  const api = await getApiClient();
  if (!api) redirect("/login");

  const [data, employees] = await Promise.all([
    api.documents.list({ limit: 100 }),
    api.employees.list({ limit: 200 }),
  ]);
  const empById = new Map(employees.items.map((e) => [e.id, e]));

  return (
    <div className="p-8 sm:p-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Register documents (contracts, IDs, policies). Files live wherever you upload them — pass a URL.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>New document</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createDocumentAction} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Employment contract — Jane Doe" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select id="type" name="type" defaultValue="other" required>
                <option value="contract">Contract</option>
                <option value="offer_letter">Offer letter</option>
                <option value="id_document">ID document</option>
                <option value="policy">Policy</option>
                <option value="certificate">Certificate</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employeeId">Employee (optional)</Label>
              <Select id="employeeId" name="employeeId" defaultValue="">
                <option value="">— Org-level —</option>
                {employees.items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fileUrl">File URL (optional)</Label>
              <Input id="fileUrl" name="fileUrl" type="url" placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiresAt">Expires (optional)</Label>
              <Input id="expiresAt" name="expiresAt" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" name="notes" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Add document</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-base font-semibold mb-3">Library</h2>
        {data.items.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No documents yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Employee</TH>
                  <TH>Expires</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((d) => {
                  const emp = d.employeeId ? empById.get(d.employeeId) : null;
                  return (
                    <TR key={d.id}>
                      <TD className="font-medium">
                        {d.fileUrl ? (
                          <a href={d.fileUrl} target="_blank" rel="noreferrer" className="underline">
                            {d.name}
                          </a>
                        ) : (
                          d.name
                        )}
                      </TD>
                      <TD className="capitalize">{d.type.replace("_", " ")}</TD>
                      <TD>{emp ? `${emp.firstName} ${emp.lastName}` : "—"}</TD>
                      <TD>{d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : "—"}</TD>
                      <TD className="text-right">
                        <form action={deleteDocumentAction}>
                          <input type="hidden" name="id" value={d.id} />
                          <Button size="sm" variant="outline" type="submit">Delete</Button>
                        </form>
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
