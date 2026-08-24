import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDnsRecords, sesDkimRecords } from "./dns";

// SES-managed DKIM. The bug this replaces was silent and long-lived: we
// generated a key per customer, had them publish it, encrypted it, rotated it —
// and never signed with it, because SES signs via Easy DKIM on whichever
// identity the From domain belongs to. The tests that matter are the ones that
// stop our own record coming back alongside Amazon's.

const TOKENS = ["tok1aaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "tok2bbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "tok3ccccccccccccccccccccccccccccc"];
const base = {
  domain: "acme.test",
  verificationToken: "vtok",
  dkimSelector: "rootmail",
  dkimValue: "v=DKIM1; k=rsa; p=OLDKEY",
};

describe("SES DKIM records", () => {
  it("emits one CNAME per token, pointed at Amazon", () => {
    const recs = sesDkimRecords("acme.test", TOKENS);
    assert.equal(recs.length, 3);
    for (const [i, r] of recs.entries()) {
      assert.equal(r.type, "CNAME");
      assert.equal(r.host, `${TOKENS[i]}._domainkey.acme.test`);
      assert.equal(r.value, `${TOKENS[i]}.dkim.amazonses.com`);
    }
  });

  it("marks them required — without them the domain cannot send at all", () => {
    // Not cosmetic: SES refuses a From address whose domain is not a verified
    // identity, and the identity does not verify until these resolve.
    assert.ok(sesDkimRecords("acme.test", TOKENS).every((r) => r.required));
  });
});

describe("SES DKIM replaces our own record", () => {
  it("publishes Amazon's CNAMEs and NOT our TXT key", () => {
    const recs = buildDnsRecords({ ...base, sesDkimTokens: TOKENS });
    const dkim = recs.filter((r) => r.purpose === "dkim");
    assert.equal(dkim.length, 3);
    assert.ok(dkim.every((r) => r.type === "CNAME"));
    // The whole point: a key of ours alongside Amazon's would authenticate
    // nothing and be one more thing for the customer to get wrong.
    assert.equal(
      recs.some((r) => r.purpose === "dkim" && r.type === "TXT"),
      false,
    );
  });

  it("falls back to the self-generated TXT when a domain has no SES identity yet", () => {
    // Rows created before this shipped, and the window between creating a client
    // and SES accepting the domain.
    const recs = buildDnsRecords(base);
    const dkim = recs.filter((r) => r.purpose === "dkim");
    assert.equal(dkim.length, 1);
    assert.equal(dkim[0].type, "TXT");
  });

  it("still asks for ownership, SPF and DMARC either way", () => {
    for (const recs of [buildDnsRecords(base), buildDnsRecords({ ...base, sesDkimTokens: TOKENS })]) {
      for (const p of ["ownership", "spf", "dmarc"]) {
        assert.ok(recs.some((r) => r.purpose === p), `${p} missing`);
      }
    }
  });

  it("treats an empty token list as no identity rather than no DKIM", () => {
    // An empty array from a failed SES call must not silently strip DKIM.
    const recs = buildDnsRecords({ ...base, sesDkimTokens: [] });
    assert.equal(recs.filter((r) => r.purpose === "dkim").length, 1);
    assert.equal(recs.find((r) => r.purpose === "dkim")?.type, "TXT");
  });
});
