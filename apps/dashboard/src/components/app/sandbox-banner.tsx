import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { SandboxToggle } from "./sandbox-toggle";

/**
 * The unmissable "you are in the Sandbox" strip. Everything on screen in this
 * mode is test data: sends are simulated (rendered and recorded, but handed to
 * no provider, so they cost nothing and reach nobody), and nothing from your
 * live workspace shows here.
 *
 * The way out lives IN THE BANNER, not buried in a picker — you came here on
 * purpose from Developers → Testing, and leaving should be just as direct.
 *
 * The one exception to "nothing leaves" — and the reason the sandbox is worth
 * anything — is mail to a reserved test recipient, which really does go out.
 */
export function SandboxBanner({
  workspaceName,
  liveId = null,
  liveName = null,
}: {
  workspaceName?: string | null;
  /** The live workspace to return to. */
  liveId?: string | null;
  liveName?: string | null;
}) {
  return (
    <div className="border-b border-acted/30 bg-acted/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm text-acted md:px-8">
        <span className="flex shrink-0 items-center gap-2 font-semibold">
          <FlaskConical className="size-4 shrink-0" />
          Sandbox{workspaceName ? ` · ${workspaceName}` : ""}
        </span>
        <span className="min-w-0 flex-1 text-acted">
          A rehearsal room for developers: sends here are simulated and never reach a real person, and none of
          your live data is shown.{" "}
          <Link href="/testing" className="font-medium underline underline-offset-2">
            Prove real delivery
          </Link>{" "}
          without leaving.
        </span>
        <SandboxToggle sandboxId={null} liveId={liveId} liveName={liveName} inSandbox variant="banner" />
      </div>
    </div>
  );
}
