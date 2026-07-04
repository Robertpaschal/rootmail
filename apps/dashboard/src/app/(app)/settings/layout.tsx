import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/page-header";
import { SettingsTabs } from "./settings-tabs";

// One header + one tab strip for the whole Settings section, so every sub-page
// reads as a sub-page of Settings (not a standalone screen), and you can move
// between them — or land on any directly — with the context always visible.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your account, sign-in, and sending compliance."
      />
      <SettingsTabs />
      <div className="mt-6 max-w-3xl">{children}</div>
    </>
  );
}
