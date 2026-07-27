import { redirect } from "next/navigation";

/** The test inbox grew up into /testing (rehearsal + real proof, one place). */
export default function TestInboxRedirect() {
  redirect("/testing");
}
