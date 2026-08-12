import { like, notLike, or } from "drizzle-orm";
import { TEST_RECIPIENT_DOMAIN } from "@rootmail/core";
import { messages } from "@rootmail/db";

/**
 * Conditions that narrow a `messages` query to mail sent to actual people.
 *
 * The product promises, in three separate places, that the built-in test
 * scenarios "never affect your sending reputation" — and then offers a bounce
 * scenario and a complaint scenario and encourages you to run them. Any surface
 * that reports on outcomes has to honour that promise, or the product calls
 * itself a liar: running the three scenarios on a fresh workspace was enough to
 * show "55/100, grade F, your sending reputation is at risk" on Deliverability
 * and "20% bounced / spam" on Analytics.
 *
 * This lives in one place because it was got wrong twice — Deliverability was
 * fixed first and Analytics still read the polluted numbers an hour later. The
 * next surface that counts message outcomes should spread this rather than
 * write the filter again.
 *
 * Matching is on the address because there is no column to match on:
 * `test_recipient` is derived from `toEmail` at serialisation time, so nothing
 * in the schema hints that the exclusion is needed. Raw simulator addresses are
 * covered too — those are never real people either.
 */
export function realSendsOnly() {
  return [
    notLike(messages.toEmail, `%@${TEST_RECIPIENT_DOMAIN}`),
    notLike(messages.toEmail, "%@simulator.amazonses.com"),
  ];
}

/**
 * The exact inverse: only the test sends.
 *
 * Excluding tests from a reputation figure and then never mentioning them makes
 * the tests look like they did nothing — so anywhere we filter them out, we
 * count them here and show the number beside it. "247 real sends · 12 test
 * sends (not counted)" is honest; a silently smaller total is not.
 */
export function testSendsOnly() {
  return or(
    like(messages.toEmail, `%@${TEST_RECIPIENT_DOMAIN}`),
    like(messages.toEmail, "%@simulator.amazonses.com"),
  );
}
