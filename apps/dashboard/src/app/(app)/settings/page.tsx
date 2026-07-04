import { redirect } from "next/navigation";

// Settings has no separate "hub" — the tab strip is the navigation, and Profile
// is the natural landing. This keeps the old /settings entry point working
// (topbar chip, bookmarks) by sending it to the first tab.
export default function SettingsPage() {
  redirect("/settings/profile");
}
