import { createPrivateKey, createPublicKey, type KeyObject, sign, verify } from "node:crypto";
import { env } from "./env";

// Layer 3: Ed25519-signed proof bundles of a message's lifecycle. The signing
// key comes from PROOF_SIGNING_KEY (PKCS8 PEM); unset → a stable dev key so
// proofs verify across restarts in local dev. PRODUCTION MUST set its own key
// (this one is public, in source — dev-only, like the link-signing fallback).
const DEV_PROOF_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIFN412AGmRRBVx+saStk5pIP4UrwMaKQYeFJh63Dr2jE
-----END PRIVATE KEY-----
`;

let privateKey: KeyObject | undefined;
let publicKey: KeyObject | undefined;

function loadKeys(): { priv: KeyObject; pub: KeyObject } {
  if (!privateKey) {
    const pem = env.PROOF_SIGNING_KEY?.includes("PRIVATE KEY") ? env.PROOF_SIGNING_KEY : DEV_PROOF_KEY;
    privateKey = createPrivateKey(pem);
    publicKey = createPublicKey(privateKey);
  }
  return { priv: privateKey, pub: publicKey! };
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

/** Verify a bundle+signature against the SERVER's key (not the bundle's own
 * public_key) — so a forged bundle signed with someone else's key fails. */
export function verifyProof(bundle: object, signatureB64: string): boolean {
  try {
    const data = Buffer.from(canonicalize(bundle));
    return verify(null, data, loadKeys().pub, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}
