import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, api } from "@/lib/rootmail";
import type { ContactDetail, ContactList } from "@/lib/types";
import { ContactCrm } from "./crm";

export const metadata: Metadata = { title: "Contact" };

// One customer's whole relationship in one place — profile, audiences, notes,
// and everything that's happened. The Audience hub's rows land here.
export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let contact: ContactDetail;
  let allLists: ContactList[] = [];
  try {
    contact = await api.contactDetail(id);
    allLists = (await api.listLists().catch(() => ({ data: [] as ContactList[] }))).data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader title={contact.name ?? contact.email} backHref="/contacts" backLabel="Audience" />
      <ContactCrm contact={contact} allLists={allLists} />
    </>
  );
}
