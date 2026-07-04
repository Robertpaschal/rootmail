import type { Metadata } from "next";
import { api } from "@/lib/rootmail";
import { ProfileCard } from "../profile-card";

export const metadata: Metadata = { title: "Profile · Settings" };

export default async function ProfileSettingsPage() {
  let name = "";
  let email = "";
  let verified = false;
  let avatarUrl: string | null = null;
  let workspace = "";
  try {
    const me = await api.me();
    name = me.user.name ?? "";
    email = me.user.email;
    verified = me.user.email_verified;
    avatarUrl = me.user.avatar_url;
    workspace = (me.active_workspace ?? me.workspaces[0])?.name ?? "";
  } catch {
    /* render with defaults if the lookup fails */
  }

  return (
    <ProfileCard
      name={name}
      email={email}
      verified={verified}
      avatarUrl={avatarUrl}
      workspace={workspace}
    />
  );
}
