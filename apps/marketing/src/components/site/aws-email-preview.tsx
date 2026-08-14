/**
 * What Amazon's verification email looks like, so a tester recognises it.
 *
 * The one step of beta signup we do not control is an unexplained email from
 * Amazon Web Services, and until they click it we cannot reach them at all. A
 * stranger who was not told to expect it either ignores it or reports it as
 * phishing — and the honest reading is that it DOES look like phishing: an
 * unfamiliar sender, a very long signed URL, and a request to click.
 *
 * Showing it in advance turns "this is suspicious" into "this is the thing they
 * said would come".
 *
 * Drawn rather than screenshotted, deliberately: a real screenshot carries
 * someone's inbox — their name, avatar, other subject lines — which would need
 * obscuring and would still be a picture of a real person's mail. This carries
 * no personal data because there is none to carry, stays sharp at any size,
 * follows the light/dark theme, and weighs a few KB instead of half a megabyte.
 */
export function AwsEmailPreview() {
  return (
    <figure className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <figcaption className="border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
        This is the email to look for
      </figcaption>

      <div className="space-y-3 p-4">
        <p className="text-sm font-semibold leading-snug">
          Amazon Web Services – Email Address Verification Request in region US East (N. Virginia)
        </p>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* Stand-in for the sender avatar — no image to load, no origin to allow. */}
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#ff9900]/15 text-[10px] font-bold text-[#e88b00]">
            aws
          </span>
          <span>
            <span className="font-medium text-foreground">Amazon Web Services</span>{" "}
            &lt;no-reply-aws@amazon.com&gt;
          </span>
        </div>

        <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <p>Dear Amazon Web Services Customer,</p>
          <p>
            We have received a request to authorize this email address for use with Amazon SES…
            please go to the following URL to confirm that you are authorized to use this email
            address:
          </p>
          {/* The long signed URL is the part that looks alarming, so show its
              shape without pretending to be clickable. */}
          <p className="break-all font-mono text-[10px] text-primary/70">
            https://email-verification.us-east-1.amazonaws.com/?Context=…&amp;Identity.IdentityName=
            <span className="text-foreground">you@yourcompany.com</span>&amp;X-Amz-Signature=…
          </p>
          <p>This link expires 24 hours after your original verification request.</p>
        </div>

        <p className="text-xs text-muted-foreground">
          It&apos;s genuine, and it&apos;s the only way we&apos;re allowed to email you while
          rootmail is in beta. Click the link and your invite follows.
        </p>
      </div>
    </figure>
  );
}
