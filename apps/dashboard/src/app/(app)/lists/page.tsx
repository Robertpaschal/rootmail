import { redirect } from "next/navigation";

// Audiences live in the Audience hub now (one roof with People + imports).
// Old links land on the hub's Audiences tab; /lists/[id] detail pages remain.
export default function ListsPage() {
  redirect("/contacts?tab=audiences");
}
