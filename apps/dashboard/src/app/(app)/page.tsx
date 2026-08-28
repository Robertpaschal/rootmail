import { redirect } from "next/navigation";
import { SIGNED_IN_HOME } from "@/lib/home";

/** Signed-in home is Mail. Overview lives at /overview as furniture. */
export default function Home() {
  redirect(SIGNED_IN_HOME);
}
