import { redirect } from "next/navigation";

/** Compose is /messages/new. /compose 404d; this is the door it meant. */
export default function ComposeRedirect() {
  redirect("/messages/new");
}
