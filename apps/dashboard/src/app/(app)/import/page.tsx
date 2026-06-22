import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/rootmail";
import { ImportPanel } from "./import-panel";

export default async function ImportPage() {
  let lists: { id: string; name: string }[] = [];
  try {
    const res = await api.listLists();
    lists = res.data.map((l) => ({ id: l.id, name: l.name }));
  } catch {
    // Lists are optional context for the contacts importer; suppressions still work.
  }

  return (
    <>
      <PageHeader
        title="Import"
        description="Migrate from another provider — bring over your suppression list and contacts so you don't lose sender reputation or your audience."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import from another provider</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportPanel lists={lists} />
        </CardContent>
      </Card>
    </>
  );
}
