import { generateKeyPairSync } from "node:crypto";

export interface DkimKeypair {
  selector: string;
  /** PEM-encoded SPKI public key. */
  publicKeyPem: string;
  /** PEM-encoded PKCS#8 private key — store encrypted at rest in production. */
  privateKeyPem: string;
  /** Base64 body of the public key (no PEM armor), for the DKIM DNS record. */
  publicKeyBase64: string;
  /** Full TXT value to publish at `<selector>._domainkey.<domain>`. */
  dnsValue: string;
}

function pemBody(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
}

/** Generate a 2048-bit RSA DKIM keypair and the TXT record value for it. */
export function generateDkimKeypair(selector: string): DkimKeypair {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const publicKeyBase64 = pemBody(publicKey);
  return {
    selector,
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    publicKeyBase64,
    dnsValue: `v=DKIM1; k=rsa; p=${publicKeyBase64}`,
  };
}
