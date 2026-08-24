import type { Metadata } from "next";
import { DocPage } from "@/components/site/doc-page";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description:
    "The sending rules every rootmail account agrees to: permission-based lists only, no purchased or scraped addresses, honored unsubscribes — and how we enforce them.",
};

/**
 * The rules, published where they can be found.
 *
 * The substance already existed in Terms §4, which is the correct place for it
 * legally and the wrong place for it practically: nobody assessing whether we
 * are a responsible sender — a prospective customer, an abuse desk, or our own
 * email provider — reads a Terms document to section four. An email platform
 * that sends on behalf of other people is judged partly on whether it publishes
 * enforceable rules for those people, so the rules get their own page, their own
 * footer link, and plain language.
 *
 * Everything stated here as enforcement is enforced in code today. Nothing on
 * this page is aspirational — if a control is described in the present tense, it
 * exists, and the numbers match the constants the system actually runs on.
 */
export default function AcceptableUsePage() {
  return (
    <DocPage
      title="Acceptable Use Policy"
      subtitle="What you may and may not send through rootmail — and what we do about it."
      updated="August 24, 2026"
    >
      <p>
        This policy applies to every rootmail account, and to every one of your own customers if you
        send on their behalf. It forms part of our{" "}
        <a href="/legal/terms">Terms of Service</a>. If you send through rootmail, you are
        responsible for the mail your account produces — including mail sent by your customers.
      </p>

      <h2>Permission is the whole rule</h2>
      <p>
        You may only send to people who gave you permission to email them. Everything below follows
        from that one sentence.
      </p>
      <ul>
        <li>
          <strong>Purchased, rented, scraped and appended lists are prohibited.</strong> No
          exceptions, and no &ldquo;we bought it from a reputable vendor&rdquo;. If you did not
          collect the address yourself, you may not mail it.
        </li>
        <li>
          <strong>Marketing recipients must have opted in.</strong> Through a signup form, a
          checkout, an account, or another action they took knowingly. Pre-ticked boxes and
          consent bundled into unrelated terms do not count.
        </li>
        <li>
          <strong>Transactional mail must be triggered by the recipient&apos;s own action</strong> —
          a receipt, a password reset, an order update. A marketing message does not become
          transactional because you call it one.
        </li>
        <li>
          <strong>Unsubscribes are final.</strong> Every marketing and sales message carries a
          working one-click unsubscribe, and an opt-out applies across your whole account.
        </li>
      </ul>

      <h2>Prohibited content and conduct</h2>
      <p>You and your users will not use rootmail to:</p>
      <ul>
        <li>send unsolicited bulk email, or mail anyone without a lawful basis or valid consent;</li>
        <li>
          send phishing, malware, deceptive headers or forged sender information, or impersonate
          anyone;
        </li>
        <li>
          send unlawful, infringing, harassing, or harmful content, including content that promotes
          fraud;
        </li>
        <li>
          break anti-spam or privacy law — CAN-SPAM, CASL, GDPR and ePrivacy among them — including
          the requirement to carry a real physical mailing address on commercial mail;
        </li>
        <li>
          bypass or attempt to bypass suppression lists, unsubscribe handling, quotas, rate limits,
          or plan boundaries — including by splitting sending across accounts or sub-tenants;
        </li>
        <li>
          probe, scan, overload or interfere with the service, or attempt access you were not
          granted; or
        </li>
        <li>
          resell rootmail to third parties except through the sub-tenancy features, for your own
          customers, for whose sending you remain responsible.
        </li>
      </ul>

      <h2>How we enforce this</h2>
      <p>
        These are not aspirations. Each of the following runs automatically, without waiting for a
        person to notice:
      </p>
      <ul>
        <li>
          <strong>Bounces and complaints suppress the address immediately.</strong> A hard bounce or
          any spam complaint adds that recipient to your suppression list automatically, and the
          suppression is applied before a later message is ever handed to our sending provider. You
          cannot remove a bounce or complaint suppression.
        </li>
        <li>
          <strong>Each of your clients is scored on its own.</strong> If you send for multiple
          customers, every sending domain carries its own bounce and complaint rates over a rolling
          seven days. Cross a warning threshold and you hear about it; cross a higher one and that
          client&apos;s sending is throttled; cross the top one and it is paused outright. Only a
          person can lift a pause.
        </li>
        <li>
          <strong>Imports require you to say so.</strong> Uploading a list requires an explicit
          confirmation that everyone on it gave you permission. We record that confirmation against
          the import.
        </li>
        <li>
          <strong>Marketing cannot reach a stranger.</strong> A marketing or sales message to an
          address that is not already in your audience is refused.
        </li>
        <li>
          <strong>Domains are re-checked continuously.</strong> Verification is not a one-time
          gate — if a sending domain&apos;s DNS records disappear, we tell you, and if they stay
          missing we stop that domain&apos;s sending.
        </li>
      </ul>
      <p>
        We may throttle, suspend or terminate sending or an account that violates this policy,
        threatens deliverability for other customers, or creates legal or security risk — immediately
        where the situation requires it, and without refund where the violation is deliberate.
      </p>

      <h2>Reporting abuse</h2>
      <p>
        If you received mail sent through rootmail that you believe violates this policy, tell us at{" "}
        <a href="mailto:abuse@rootmail.io">abuse@rootmail.io</a> and include the full message
        headers if you can. We investigate every report. You can also reach us through our{" "}
        <a href="/contact">contact page</a>.
      </p>
      <p>
        To stop receiving mail from a particular sender, use the unsubscribe link in the message —
        it is honored across that sender&apos;s entire account, permanently.
      </p>
    </DocPage>
  );
}
