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
        description="You, how your email is sent, and everything else you can change — with what it's set to right now."
      />
      <SettingsTabs />
      {/* 3xl was sized for a single form column. The map wants room for a value
          on the right of every row, so the section reads at one width. */}
      <div className="mt-6 max-w-4xl">{children}</div>
    </>
  );
}
