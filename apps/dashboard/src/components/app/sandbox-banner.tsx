import { FlaskConical } from "lucide-react";

/**
 * The unmissable "you are in the Sandbox" strip. Everything on screen in this
 * mode is test data: sends are simulated (they land in the Test inbox, never a
 * real mailbox, and cost nothing), and nothing from your live workspace shows
 * here. Switch workspaces from the picker in the top bar.
 */
export function SandboxBanner({ workspaceName }: { workspaceName?: string | null }) {
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-sm text-amber-700 dark:text-amber-400 md:px-8">
        <FlaskConical className="size-4 shrink-0" />
        <span className="font-semibold">Sandbox{workspaceName ? ` · ${workspaceName}` : ""}</span>
        <span className="text-amber-700/80 dark:text-amber-400/80">
          Everything here is test data — sends are simulated, land in the Test inbox, and never reach a real
          person. Your live workspace and its data stay separate; switch workspaces up top to go live.
        </span>
      </div>
    </div>
  );
}
