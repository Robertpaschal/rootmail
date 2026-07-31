import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@/lib/rootmail";
import type { MeResult, Organization } from "@/lib/types";
import { SettingsItem, SettingsSection, StateBadge } from "../setting-item";
import { ProfileCard } from "../profile-card";
import { WorkspaceList } from "./workspace-list";

export const metadata: Metadata = { title: "Profile · Settings" };

function joined(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// Profile is the answer to "who am I here, and what can I get into?".
// It used to show a bare EMAIL with no label — leaving people to guess whether
// that was their sign-in or the address their recipients see (they're different
// things, and the second one lives under Sending) — and a single WORKSPACE
// value, when nearly every account has at least two.
export default async function ProfileSettingsPage() {
  let me: MeResult | null = null;
  let org: Organization | null = null;
  const [meRes, orgRes] = await Promise.allSettled([api.me(), api.getOrganization()]);
  if (meRes.status === "fulfilled") me = meRes.value;
  if (orgRes.status === "fulfilled") org = orgRes.value;

  const user = me?.user;
  const workspaces = me?.workspaces ?? [];
  const since = joined(user?.created_at);

  return (
    <div className="space-y-8">
      <ProfileCard
        name={user?.name ?? ""}
        email={user?.email ?? ""}
        avatarUrl={user?.avatar_url ?? null}
      />

      <SettingsSection title="Your sign-in">
        <SettingsItem
          label="Sign-in email"
          description={
            <>
              The address you sign in with, and where we send account and security mail. This is{" "}
              <strong>not</strong> the address your recipients see — that&apos;s a{" "}
              <Link href="/settings/sender" className="font-medium text-primary hover:underline">
                sending address
              </Link>
              , and you can have several.
            </>
          }
          value={
            <span className="flex flex-col items-end gap-1">
              <span className="font-medium text-foreground">{user?.email || "—"}</span>
              {user ? (
                user.email_verified ? (
                  <StateBadge tone="ok">Verified</StateBadge>
                ) : (
                  <StateBadge tone="warn">Unverified</StateBadge>
                )
              ) : null}
            </span>
          }
        />
        <SettingsItem
          label="Two-factor authentication"
          description="Managed under Security & login."
          value={
            user?.mfa_enabled ? (
              <StateBadge tone="ok">On</StateBadge>
            ) : (
              <StateBadge tone="warn">Off</StateBadge>
            )
          }
          control={
            <Link
              href="/settings/security"
              className="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              Manage
            </Link>
          }
        />
        {since ? (
          <SettingsItem
            label="With rootmail since"
            description="When this account was created."
            value={<span className="text-muted-foreground">{since}</span>}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        title={workspaces.length === 1 ? "Your workspace" : "Your workspaces"}
        hint={
          org?.name
            ? `Everything you see in the dashboard belongs to one workspace inside ${org.name}. Switching here changes what the whole app is showing you.`
            : "Everything you see in the dashboard belongs to one workspace. Switching here changes what the whole app is showing you."
        }
      >
        <WorkspaceList workspaces={workspaces} activeId={me?.active_workspace?.id ?? null} />
      </SettingsSection>

      {me?.impersonating ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          A rootmail staff member is currently signed in as you for support.
        </p>
      ) : null}
    </div>
  );
}
