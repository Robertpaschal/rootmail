import { api } from "@/lib/rootmail";
import { placeholderPerson, type PreviewPerson } from "@/lib/sample-vars";
import type { TestRecipient } from "@/lib/types";

/**
 * Everything the studio needs to show a FINISHED email rather than a form:
 * who it comes from, what the company is called, and a real person to render
 * it as. All best-effort — the studio works with none of it.
 */
export async function studioContext(): Promise<{
  testRecipients: TestRecipient[];
  myEmail: string | null;
  productName: string | null;
  previewPerson: PreviewPerson;
  senderLabel: string;
}> {
  const [tr, me, org, contacts, senders] = await Promise.all([
    api.listTestRecipients().catch(() => ({ data: [] as TestRecipient[] })),
    api.me().catch(() => null),
    api.getOrganization().catch(() => null),
    api.browseContacts({ status: "active", limit: 1 }).catch(() => ({ data: [] })),
    api.listSenders().catch(() => ({ data: [] })),
  ]);

  const c = contacts.data[0];
  const previewPerson: PreviewPerson = c
    ? { email: c.email, name: c.name, extra: c.metadata, real: true }
    : placeholderPerson(me?.user.email ?? null);

  const sender =
    senders.data.find((s) => s.status === "verified" && s.is_default) ??
    senders.data.find((s) => s.status === "verified");
  const senderLabel = sender
    ? sender.display_name
      ? `${sender.display_name} <${sender.email}>`
      : sender.email
    : `${org?.name ?? "Your workspace"} <your workspace address>`;

  return {
    testRecipients: tr.data,
    myEmail: me?.user.email ?? null,
    productName: org?.name ?? null,
    previewPerson,
    senderLabel,
  };
}
