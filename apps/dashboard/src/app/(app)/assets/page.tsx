import { redirect } from "next/navigation";

// Assets only matter *inside* an email, so the standalone page is retired:
// images live in the template studio's media library, and file attachments in
// the composer. Old links land on Templates.
export default function AssetsPage() {
  redirect("/templates");
}
