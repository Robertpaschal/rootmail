import { redirect } from "next/navigation";

// Docs live with the developer pitch now (audience doctrine): the main site
// carries zero developer surface.
export default function DocsRedirect() {
  redirect("https://developers.gateml.io/docs");
}
