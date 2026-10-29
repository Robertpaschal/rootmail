import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify, createPublicKey, createPrivateKey } from "node:crypto";
import { after, describe, it } from "node:test";
import { env } from "./env";
import {
  DEV_PROOF_KEY,
  ProofKeyError,
  assertProofSigningKey,
  canonicalize,
  proofKeyFingerprint,
  proofVerifyPublicKeys,
  resolveProofSigningKey,
  signProof,
  verifyProof,
} from "./proof";

// No key material is written in this file: the dev key is imported from
// proof.ts and every other key is generated when the test runs.
const DEV_PEM = DEV_PROOF_KEY;


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
    // A generated key's PEM armour around a body that isn't a key.
    const lines = pkcs8("ed25519").trim().split("\n");
    const garbled = [lines[0], "AAAAsupersecretgarbageAAAA", lines.at(-1), ""].join("\n");
    assertRefused(garbled, /could not be parsed/);
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

  it("uses a multi-line PEM and a single-line \\n PEM as the same key", () => {
    const pem = pkcs8("ed25519");
    const expected = proofKeyFingerprint(createPublicKey(pem));
    assert.equal(proofKeyFingerprint(resolveProofSigningKey(pem, false)), expected);
    assert.equal(proofKeyFingerprint(resolveProofSigningKey(pem.trim().replace(/\n/g, "\\n"), false)), expected);
  });

  it("still allows the dev key itself", () => {
    assert.equal(proofKeyFingerprint(resolveProofSigningKey(DEV_PEM, false)), devFingerprint);
  });
});

function spki(privatePem: string): string {
  const exported = createPublicKey(privatePem).export({ type: "spki", format: "pem" });
  return typeof exported === "string" ? exported : exported.toString("utf8");
}

function signBundle(bundle: object, privatePem: string): string {
  return sign(null, Buffer.from(canonicalize(bundle)), createPrivateKey(privatePem)).toString("base64");
}

describe("proof verification — retired public keys", { concurrency: false }, () => {
  const previous = {
    nodeEnv: env.NODE_ENV,
    key: env.PROOF_SIGNING_KEY,
    extras: env.PROOF_VERIFY_PUBLIC_KEYS,
  };

  after(() => {
    env.NODE_ENV = previous.nodeEnv;
    env.PROOF_SIGNING_KEY = previous.key;
    env.PROOF_VERIFY_PUBLIC_KEYS = previous.extras;
  });

  it("verifies a retired key when it is listed, in either PEM form, and rejects it when it is not", () => {
    const currentPrivate = pkcs8("ed25519");
    const oldPrivate = pkcs8("ed25519");
    const otherPrivate = pkcs8("ed25519");
    const currentPublic = spki(currentPrivate);
    const oldPublic = spki(oldPrivate);
    const otherPublic = spki(otherPrivate);
    const bundle = { hello: "rotation" };
    const oldSignature = signBundle(bundle, oldPrivate);
    env.NODE_ENV = "test";
    env.PROOF_SIGNING_KEY = currentPrivate;
    env.PROOF_VERIFY_PUBLIC_KEYS = undefined;
    assertProofSigningKey();
    assert.equal(verifyProof(bundle, oldSignature), false);

    env.PROOF_VERIFY_PUBLIC_KEYS = oldPublic.trim().replace(/\n/g, "\\n");
    assert.equal(verifyProof(bundle, oldSignature), true);
    env.PROOF_VERIFY_PUBLIC_KEYS = oldPublic;
    assert.equal(verifyProof(bundle, oldSignature), true);

    const signed = signProof(bundle);
    assert.equal(signed.algorithm, "ed25519");
    assert.equal(proofKeyFingerprint(createPublicKey(signed.public_key)), proofKeyFingerprint(createPublicKey(currentPublic)));
    assert.notEqual(proofKeyFingerprint(createPublicKey(signed.public_key)), proofKeyFingerprint(createPublicKey(oldPublic)));
    assert.equal(verifyProof(bundle, signed.signature), true);

    env.PROOF_VERIFY_PUBLIC_KEYS = otherPublic;
    assert.equal(verifyProof(bundle, oldSignature), false);
    assert.equal(verifyProof(bundle, signed.signature), true);

    const escaped = (pem: string) => pem.trim().replace(/\n/g, "\\n");
    env.PROOF_VERIFY_PUBLIC_KEYS = `${escaped(otherPublic)},${escaped(oldPublic)}`;
    assert.equal(verifyProof(bundle, oldSignature), true);
    assert.equal(proofVerifyPublicKeys(env.PROOF_VERIFY_PUBLIC_KEYS, false).length, 2);

    env.PROOF_VERIFY_PUBLIC_KEYS = `"${escaped(oldPublic)}"`;
    assert.equal(verifyProof(bundle, oldSignature), true);
    env.PROOF_VERIFY_PUBLIC_KEYS = oldPrivate;
    assert.throws(
      () => verifyProof(bundle, oldSignature),
      (err: Error) => {
        assert.match(err.message, /SPKI PEM public key/);
        for (const line of secretLines(oldPrivate)) assert.equal(err.message.includes(line.slice(0, 16)), false);
        return true;
      },
    );
  });

  it("rejects an unusable PROOF_VERIFY_PUBLIC_KEYS without echoing it", () => {
    const junk = "not-a-key-supersecretvalue";
    env.NODE_ENV = "test";
    env.PROOF_SIGNING_KEY = pkcs8("ed25519");
    env.PROOF_VERIFY_PUBLIC_KEYS = junk;
    assert.throws(
      () => verifyProof({ hello: "x" }, "aaaa"),
      (err: Error) => {
        assert.match(err.message, /PROOF_VERIFY_PUBLIC_KEYS entry 1/);
        assert.equal(err.message.includes(junk), false);
        return true;
      },
    );
    assert.throws(() => assertProofSigningKey(), (err: Error) => {
      assert.match(err.message, /PROOF_VERIFY_PUBLIC_KEYS/);
      assert.equal(err.message.includes(junk), false);
      return true;
    });
  });

  it("refuses the committed dev public key in production", () => {
    const devPublic = spki(DEV_PEM);
    env.NODE_ENV = "production";
    env.PROOF_SIGNING_KEY = pkcs8("ed25519");
    env.PROOF_VERIFY_PUBLIC_KEYS = devPublic;
    assert.throws(
      () => assertProofSigningKey(),
      (err: Error) => {
        assert.match(err.message, /development key committed to this repository/);
        for (const line of secretLines(devPublic)) assert.equal(err.message.includes(line.slice(0, 16)), false);
        for (const line of secretLines(DEV_PEM)) assert.equal(err.message.includes(line.slice(0, 16)), false);
        return true;
      },
    );
  });
});
