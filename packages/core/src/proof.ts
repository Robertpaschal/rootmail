import { createHash, createPrivateKey, createPublicKey, type KeyObject, sign, verify } from "node:crypto";
import { env } from "./env";

// Layer 3: Ed25519-signed proof bundles of a message's lifecycle. The signing
// key comes from PROOF_SIGNING_KEY (PKCS8 PEM); unset → a stable dev key so
// proofs verify across restarts in local dev. PRODUCTION MUST set its own key
// (this one is public, in source — dev-only, like the link-signing fallback).
const DEV_PROOF_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIFN412AGmRRBVx+saStk5pIP4UrwMaKQYeFJh63Dr2jE
-----END PRIVATE KEY-----
`;

/**
 * Exported only so tests can refer to the dev key without pasting a private-key
 * literal of their own (secret scanners flag every copy). It is public by
 * design and refused in production — see resolveProofSigningKey. Exported
 * separately so the key's own lines stay untouched in history and diffs.
 */
export { DEV_PROOF_KEY };

/** SHA-256 of the public key's SPKI DER, hex. Public information: safe to log. */
export function proofKeyFingerprint(key: KeyObject): string {
  const pub = key.type === "private" ? createPublicKey(key) : key;
  return createHash("sha256").update(pub.export({ type: "spki", format: "der" })).digest("hex");
}

const DEV_PROOF_KEY_FINGERPRINT = proofKeyFingerprint(createPrivateKey(DEV_PROOF_KEY));

/**
 * Undo the ways an env loader can mangle a correct PEM, so a good key is never
 * refused for its packaging: surrounding whitespace or one pair of quotes, CRLF
 * line endings, and the single-line `\n`-escaped form .env.example documents.
 */
function normalizePem(raw: string): string {
  let pem = raw.trim();
  if (pem.length >= 2 && (pem[0] === '"' || pem[0] === "'") && pem.at(-1) === pem[0]) pem = pem.slice(1, -1).trim();
  if (!pem.includes("\n") && pem.includes("\\n")) pem = pem.replace(/\\n/g, "\n");
  pem = pem.replace(/\r\n/g, "\n");
  return `${pem}\n`;
}

/**
 * Thrown when production has no usable proof-signing key. The message names
 * the problem and never includes any part of the configured value.
 */
export class ProofKeyError extends Error {
  constructor(problem: string) {
    super(
      `PROOF_SIGNING_KEY ${problem} Proof bundles must be signed with this deployment's own Ed25519 key. ` +
        "Generate one with `openssl genpkey -algorithm ed25519` and set the whole PEM " +
        "(-----BEGIN PRIVATE KEY----- … -----END PRIVATE KEY-----). The configured value is not shown.",
    );
    this.name = "ProofKeyError";
  }
}

function unwrapQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && (trimmed[0] === '"' || trimmed[0] === "'") && trimmed.at(-1) === trimmed[0]) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Decide which key signs proofs.
 *
 * Outside production, a value containing "PRIVATE KEY" is used after the same
 * PEM normalization as production; anything else falls back to the committed dev key.
 *
 * In production: fail closed. Missing, malformed, unparsable, not Ed25519, or
 * the committed dev key itself → ProofKeyError. Before this, every one of those
 * silently signed with a key anyone can read in this repository.
 */
export function resolveProofSigningKey(raw: string | undefined, production: boolean): KeyObject {
  const pem = raw === undefined || raw.trim() === "" ? undefined : normalizePem(raw);
  if (!production) {
    return createPrivateKey(pem !== undefined && pem.includes("PRIVATE KEY") ? pem : DEV_PROOF_KEY);
  }

  if (pem === undefined) throw new ProofKeyError("is required in production and is not set.");
  if (!pem.includes("-----BEGIN PRIVATE KEY-----") || !pem.includes("-----END PRIVATE KEY-----")) {
    throw new ProofKeyError("is set but is not a PKCS8 PEM private key.");
  }

  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch {
    // Deliberately not chained: the parser's error is not ours to vouch for.
    throw new ProofKeyError("is set but could not be parsed as a private key (check that the line breaks survived).");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new ProofKeyError(`must be an Ed25519 key, but it is ${key.asymmetricKeyType ?? "an unknown type"}.`);
  }
  if (proofKeyFingerprint(key) === DEV_PROOF_KEY_FINGERPRINT) {
    throw new ProofKeyError("is the development key committed to this repository, whose private half is public.");
  }
  return key;
}

/** SPKI public keys from `PROOF_VERIFY_PUBLIC_KEYS`. The value is never included in an error. */
export function proofVerifyPublicKeys(raw: string | undefined, production: boolean): KeyObject[] {
  if (raw === undefined || raw.trim() === "") return [];
  const parts = unwrapQuotes(raw)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return parts.map((part, index) => {
    const pem = normalizePem(part);
    const label = `entry ${index + 1}`;
    if (!pem.includes("-----BEGIN PUBLIC KEY-----") || !pem.includes("-----END PUBLIC KEY-----")) {
      throw new Error(
        `PROOF_VERIFY_PUBLIC_KEYS ${label} must be an SPKI PEM public key (-----BEGIN PUBLIC KEY-----). The configured value is not shown.`,
      );
    }
    let key: KeyObject;
    try {
      key = createPublicKey(pem);
    } catch {
      throw new Error(`PROOF_VERIFY_PUBLIC_KEYS ${label} could not be parsed as a public key. The configured value is not shown.`);
    }
    if (key.asymmetricKeyType !== "ed25519") {
      throw new Error(
        `PROOF_VERIFY_PUBLIC_KEYS ${label} must be an Ed25519 key, but it is ${key.asymmetricKeyType ?? "an unknown type"}.`,
      );
    }
    if (production && proofKeyFingerprint(key) === DEV_PROOF_KEY_FINGERPRINT) {
      throw new Error(
        `PROOF_VERIFY_PUBLIC_KEYS ${label} is the development key committed to this repository, whose private half is public.`,
      );
    }
    return key;
  });
}

let privateKey: KeyObject | undefined;
let publicKey: KeyObject | undefined;

function loadKeys(): { priv: KeyObject; pub: KeyObject } {
  if (!privateKey) {
    const priv = resolveProofSigningKey(env.PROOF_SIGNING_KEY, env.NODE_ENV === "production");
    publicKey = createPublicKey(priv);
    privateKey = priv;
  }
  return { priv: privateKey, pub: publicKey! };
}

/**
 * Resolve the signing key now, so a bad production key stops the API at
 * startup instead of on the first proof request. Re-reads env every call.
 * Returns the public fingerprint for the startup log.
 */
export function assertProofSigningKey(): { fingerprint: string; dev: boolean } {
  privateKey = undefined;
  publicKey = undefined;
  const { pub } = loadKeys();
  proofVerifyPublicKeys(env.PROOF_VERIFY_PUBLIC_KEYS, env.NODE_ENV === "production");
  const fingerprint = proofKeyFingerprint(pub);
  return { fingerprint, dev: fingerprint === DEV_PROOF_KEY_FINGERPRINT };
}

/** The server's Ed25519 public key (SPKI PEM) — published in every bundle. */
export function proofPublicKeyPem(): string {
  return loadKeys().pub.export({ type: "spki", format: "pem" }).toString();
}

/** Stable, key-sorted JSON so a re-serialized bundle signs/verifies identically. */
export function canonicalize(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return Object.keys(o)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = sort(o[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

export interface ProofSignature {
  signature: string; // base64
  public_key: string; // SPKI PEM
  algorithm: "ed25519";
}

/** Sign a proof bundle. */
export function signProof(bundle: object): ProofSignature {
  const data = Buffer.from(canonicalize(bundle));
  const signature = sign(null, data, loadKeys().priv).toString("base64");
  return { signature, public_key: proofPublicKeyPem(), algorithm: "ed25519" };
}

/** Verify against the current public key, then each PROOF_VERIFY_PUBLIC_KEYS entry.
 * The bundle's own public_key is ignored, so a forged key in the bundle cannot pass. */
export function verifyProof(bundle: object, signatureB64: string): boolean {
  const keys = [loadKeys().pub, ...proofVerifyPublicKeys(env.PROOF_VERIFY_PUBLIC_KEYS, env.NODE_ENV === "production")];
  let data: Buffer;
  let signature: Buffer;
  try {
    data = Buffer.from(canonicalize(bundle));
    signature = Buffer.from(signatureB64, "base64");
  } catch {
    return false;
  }
  for (const key of keys) {
    try {
      if (verify(null, data, key, signature)) return true;
    } catch {
      continue;
    }
  }
  return false;
}
