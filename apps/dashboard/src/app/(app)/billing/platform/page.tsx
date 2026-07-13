import { redirect } from "next/navigation";

// "Platform" as a plan is gone — its offerings are wing-agnostic add-ons. Old
// links (nav history, emails, the command menu of older builds) land on the
// canonical add-on store.
export default function PlatformRedirect() {
  redirect("/billing/addons");
}
