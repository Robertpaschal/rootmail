import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { env } from "@rootmail/core";
import { addSesNoTrack, isPlatformMessage, platformConfigurationSet } from "./platform-mail";

describe("addSesNoTrack", () => {
  it("marks every anchor, whatever its shape", () => {
    assert.equal(addSesNoTrack('<a href="https://x.test">x</a>'), '<a ses:no-track href="https://x.test">x</a>');
    assert.equal(addSesNoTrack("<A HREF='https://x.test'>x</A>"), "<a ses:no-track HREF='https://x.test'>x</A>");
    assert.equal(addSesNoTrack('<a\n  class="btn"\n  href="https://x.test">x</a>'), '<a ses:no-track\n  class="btn"\n  href="https://x.test">x</a>');
    assert.equal(addSesNoTrack("<a>bare</a>"), "<a ses:no-track>bare</a>");
    const two = addSesNoTrack('<p><a href="1">1</a> and <a href="2">2</a></p>');
    assert.equal(two.match(/ses:no-track/g)?.length, 2);
  });
  it("is idempotent and leaves non-anchors alone", () => {
    const once = addSesNoTrack('<a href="1">1</a>');
    assert.equal(addSesNoTrack(once), once);
    assert.equal(addSesNoTrack('<a ses:no-track="" href="1">1</a>'), '<a ses:no-track="" href="1">1</a>');
    const other = '<abbr title="x">x</abbr><area href="1"><audio src="a"></audio><aside>y</aside>';
    assert.equal(addSesNoTrack(other), other);
  });
});

describe("isPlatformMessage", () => {
  const m = (type: string, campaignId: string | null = null, sequenceId: string | null = null) => ({ type, campaignId, sequenceId });
  it("is only the internal org's transactional and sequence mail", () => {
    assert.equal(isPlatformMessage(m("transactional"), true), true);
    assert.equal(isPlatformMessage(m("marketing", null, "seq_1"), true), true);
    assert.equal(isPlatformMessage(m("marketing", "cmp_1"), true), false, "our own campaigns keep tracking");
    assert.equal(isPlatformMessage(m("marketing"), true), false);
    assert.equal(isPlatformMessage(m("transactional"), false), false, "customer mail is never platform mail");
    assert.equal(isPlatformMessage(m("marketing", null, "seq_1"), false), false);
  });
});

describe("platformConfigurationSet", () => {
  it("is the override when set, else null (provider falls back to the shared set)", () => {
    const saved = env.SES_PLATFORM_CONFIGURATION_SET;
    try {
      env.SES_PLATFORM_CONFIGURATION_SET = undefined; assert.equal(platformConfigurationSet(), null);
      env.SES_PLATFORM_CONFIGURATION_SET = "  "; assert.equal(platformConfigurationSet(), null);
      env.SES_PLATFORM_CONFIGURATION_SET = "rootmail-platform"; assert.equal(platformConfigurationSet(), "rootmail-platform");
    } finally { env.SES_PLATFORM_CONFIGURATION_SET = saved; }
  });
});
