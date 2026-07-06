import Link from "next/link";
import { Trash2, Users } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { ContactList } from "@/lib/types";
import { CreateListForm } from "./create-list-form";
import { deleteList } from "./actions";

export default async function ListsPage() {
  let rows: ContactList[] | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  try {
    rows = (await api.listLists()).data;
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else failed = "An unexpected error occurred.";
  }

  return (
    <>
      <PageHeader
        title="Lists"
        description="Group your contacts — customers, subscribers, beta users — so campaigns reach exactly the right people."
      />

      <div className="mb-6">
        <CreateListForm />
      </div>

      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      ) : rows && rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" />}
          title="No lists yet"
          description="Create a list, add contacts, then send a campaign to it."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      <Link href={`/lists/${l.id}`} className="hover:underline">
                        {l.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.contacts}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {relativeTime(l.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={deleteList} className="inline">
                        <input type="hidden" name="id" value={l.id} />
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
      )}
    </>
  );
}
