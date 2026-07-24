import { redirect } from "next/navigation";

// SSO is how the TEAM signs in — folded into the Team hub. This route survives
// only so old links (and the settings hub card) keep working.
export default function SsoSettingsPage() {
  redirect("/members?tab=sso");
}
