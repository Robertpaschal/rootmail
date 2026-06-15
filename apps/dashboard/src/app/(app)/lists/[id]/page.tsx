import { notFound } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, api } from "@/lib/rootmail";
import type { Contact, ContactList } from "@/lib/types";
import { addContact, removeContact } from "../actions";

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let list: ContactList;
  let members: Contact[] = [];
  try {
    list = await api.getList(id);
    members = (await api.getListContacts(id)).data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader title={list.name} description={`${list.contacts} contacts`} backHref="/lists" backLabel="Lists" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Add a contact</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addContact} className="flex gap-2">
              <input type="hidden" name="id" value={list.id} />
              <Input name="email" type="email" placeholder="contact@company.com" required />
              <Button type="submit" size="icon" aria-label="Add">
                <UserPlus className="size-4" />
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">New emails are added as contacts automatically.</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.email}</TableCell>
                    <TableCell className="text-muted-foreground">{c.status}</TableCell>
                    <TableCell className="text-right">
                      <form action={removeContact} className="inline">
                        <input type="hidden" name="id" value={list.id} />
                        <input type="hidden" name="contact_id" value={c.id} />
                        <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="size-4" />
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
