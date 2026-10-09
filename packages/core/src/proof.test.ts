import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify, createPublicKey } from "node:crypto";
import { describe, it } from "node:test";
import { ProofKeyError, proofKeyFingerprint, resolveProofSigningKey } from "./proof";

// The committed dev key, as it appears in proof.ts. Duplicated on purpose: the
// test must catch the dev key in production even if someone edits the constant.
const DEV_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIFN412AGmRRBVx+saStk5pIP4UrwMaKQYeFJh63Dr2jE
-----END PRIVATE KEY-----
`;

const pkcs8 = (type: "ed25519" | "rsa" | "ec") => {
  const opts =
    type === "rsa" ? { modulusLength: 2048 } : type === "ec" ? { namedCurve: "prime256v1" } : {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (generateKeyPairSync as any)(type, { ...opts, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey as string;
};

/** Every base64 body line of a PEM; none of them may appear in an error. */
const secretLines = (pem: string) => pem.split(/\r?\n/).filter((l) => l && !l.startsWith("-----"));

function assertRefused(raw: string | undefined, pattern: RegExp) {
  assert.throws(
    () => resolveProofSigningKey(raw, true),
    (err: unknown) => {
      assert.ok(err instanceof ProofKeyError, `expected ProofKeyError, got ${String(err)}`);
      assert.match(err.message, pattern);
      assert.match(err.message, /PROOF_SIGNING_KEY/);
      for (const line of secretLines(raw ?? "")) assert.ok(!err.message.includes(line.slice(0, 16)), "the value is never echoed");
      if (raw && raw.trim()) assert.ok(!err.message.includes(raw.trim()), "the value is never echoed");
      return true;
    },
  );
}

describe("proof signing key — production fails closed", () => {
  it("refuses a missing or blank key", () => {
    assertRefused(undefined, /required in production/);
    assertRefused("", /required in production/);
    assertRefused("   \n", /required in production/);
  });

  it("refuses a value that is not a PKCS8 PEM", () => {
    assertRefused("not-a-key-at-all-supersecret", /not a PKCS8 PEM/);
    assertRefused(pkcs8("ed25519").replace("PRIVATE KEY", "RSA PRIVATE KEY"), /not a PKCS8 PEM|could not be parsed/);
  });

  it("refuses a PEM that does not parse", () => {
    assertRefused("-----BEGIN PRIVATE KEY-----\nAAAAsupersecretgarbageAAAA\n-----END PRIVATE KEY-----\n", /could not be parsed/);
  });

  it("refuses keys that are not Ed25519", () => {
    assertRefused(pkcs8("rsa"), /must be an Ed25519 key, but it is rsa/);
    assertRefused(pkcs8("ec"), /must be an Ed25519 key, but it is ec/);
  });

  it("refuses the committed dev key in any packaging", () => {
    assertRefused(DEV_PEM, /development key committed to this repository/);
    assertRefused(DEV_PEM.trim().replace(/\n/g, "\\n"), /development key/);
    assertRefused(DEV_PEM.replace(/\n/g, "\r\n"), /development key/);
  });
});

describe("proof signing key — a correctly configured production key is accepted", () => {
  const pem = pkcs8("ed25519");
  const expected = proofKeyFingerprint(createPublicKey(pem));
  const packagings: Record<string, string> = {
    "PKCS8 PEM with real newlines": pem,
    "no trailing newline": pem.trimEnd(),
    "surrounding whitespace": `\n  ${pem}  \n`,
    "CRLF line endings": pem.replace(/\n/g, "\r\n"),
    "single line with \\n escapes (.env.example)": pem.trim().replace(/\n/g, "\\n"),
    "wrapped in quotes by the env loader": `"${pem.trim()}"`,
  };

  for (const [name, raw] of Object.entries(packagings)) {
    it(`accepts: ${name}`, () => {
      const key = resolveProofSigningKey(raw, true);
      assert.equal(key.asymmetricKeyType, "ed25519");
      assert.equal(proofKeyFingerprint(key), expected, "the same key, not a substitute");
      const data = Buffer.from("bundle");
      assert.ok(verify(null, data, createPublicKey(key), sign(null, data, key)));
    });
  }
});

describe("proof signing key — dev and test behaviour is unchanged", () => {
  const devFingerprint = proofKeyFingerprint(createPublicKey(DEV_PEM));

  it("falls back to the dev key when unset or not a PEM", () => {
    for (const raw of [undefined, "", "garbage"]) {
      assert.equal(proofKeyFingerprint(resolveProofSigningKey(raw, false)), devFingerprint);
    }
  });

  it("uses a configured key as given", () => {
    const pem = pkcs8("ed25519");
    assert.equal(proofKeyFingerprint(resolveProofSigningKey(pem, false)), proofKeyFingerprint(createPublicKey(pem)));
  });

  it("still allows the dev key itself", () => {
    assert.equal(proofKeyFingerprint(resolveProofSigningKey(DEV_PEM, false)), devFingerprint);
  });
});
