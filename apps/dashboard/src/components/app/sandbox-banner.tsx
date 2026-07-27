import Link from "next/link";
import { FlaskConical } from "lucide-react";

/**
 * The unmissable "you are in the Sandbox" strip. Everything on screen in this
 * mode is test data: sends are simulated (rendered and recorded, but handed to
 * no provider, so they cost nothing and reach nobody), and nothing from your
 * live workspace shows here. Switch workspaces from the picker in the top bar.
 *
 * The one exception — and the reason the sandbox is worth anything — is mail to
 * a reserved test recipient, which really does go out. Testing explains it.
 */
export function SandboxBanner({ workspaceName }: { workspaceName?: string | null }) {
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-sm text-amber-700 dark:text-amber-400 md:px-8">
        <FlaskConical className="size-4 shrink-0" />
        <span className="font-semibold">Sandbox{workspaceName ? ` · ${workspaceName}` : ""}</span>
        <span className="text-amber-700/80 dark:text-amber-400/80">
          Everything here is test data — sends are simulated and never reach a real person. Your live workspace
          and its data stay separate; switch workspaces up top to go live.{" "}
          <Link href="/testing" className="font-medium underline underline-offset-2">
            Prove real delivery
          </Link>{" "}
          without leaving the sandbox.
        </span>
      </div>
    </div>
  );
}
