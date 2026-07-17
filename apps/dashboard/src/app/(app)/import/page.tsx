import { redirect } from "next/navigation";

// Importing is an entry into your people, not a place of its own: the contact
// importer lives in the Audience hub ("Add people → Import a file"), and the
// suppressions importer lives on Deliverability, where list hygiene is managed.
export default function ImportPage() {
  redirect("/contacts?add=import");
}
