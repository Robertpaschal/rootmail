/**
 * SAML SSO crypto round-trip — proves the ACS path end to end without a live IdP:
 *   1. generate a self-signed IdP cert + key
 *   2. build a SAML Response with an assertion carrying an email
 *   3. sign the assertion with xml-crypto (the lib node-saml verifies with)
 *   4. run it through the real samlFor(conn).validatePostResponseAsync + extractIdentity
 *   5. also check metadata generation, the authorize redirect, and rejection of a
 *      tampered assertion.
 * Run: pnpm --filter @rootmail/api exec tsx scripts/saml-smoke.ts
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignedXml } from "xml-crypto";
import type { SsoConnection } from "@rootmail/db";
import { acsUrl, extractIdentity, metadataXml, samlFor, spEntityId } from "../src/lib/saml";

const CONN_ID = "sso_smoke1";
const conn = (cert: string): SsoConnection => ({
  id: CONN_ID,
  organizationId: "org_smoke",
  emailDomain: "acme.com",
  idpEntityId: "https://idp.example.com/metadata",
  idpSsoUrl: "https://idp.example.com/sso",
  idpCertificate: cert,
  defaultRole: "member",
  enforced: false,
  active: true,
  scimTokenHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

function makeKeypair(): { key: string; cert: string } {
  const dir = mkdtempSync(join(tmpdir(), "saml-"));
  try {
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"),
      "-days", "1", "-subj", "/CN=idp.example.com",
    ], { stdio: "ignore" });
    return { key: readFileSync(join(dir, "k.pem"), "utf8"), cert: readFileSync(join(dir, "c.pem"), "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function unsignedResponse(email: string): string {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const acs = acsUrl(CONN_ID);
  const audience = spEntityId(CONN_ID);
  return `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp1" Version="2.0" IssueInstant="${iso(now)}" Destination="${acs}"><saml:Issuer>https://idp.example.com/metadata</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_assert1" Version="2.0" IssueInstant="${iso(now)}"><saml:Issuer>https://idp.example.com/metadata</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${email}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${iso(now + 3e5)}" Recipient="${acs}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${iso(now - 3e5)}" NotOnOrAfter="${iso(now + 3e5)}"><saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${iso(now)}" SessionIndex="_sess1"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement><saml:Attribute Name="email"><saml:AttributeValue>${email}</saml:AttributeValue></saml:Attribute><saml:Attribute Name="displayName"><saml:AttributeValue>Ada Lovelace</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion></samlp:Response>`;
}

function signAssertion(xml: string, key: string, cert: string): string {
  const sig = new SignedXml({ privateKey: key, publicCert: cert });
  sig.signatureAlgorithm = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
  sig.canonicalizationAlgorithm = "http://www.w3.org/2001/10/xml-exc-c14n#";
  sig.addReference({
    xpath: "//*[local-name(.)='Assertion']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });
  sig.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']", action: "after" },
  });
  return sig.getSignedXml();
}

async function main() {
  let failures = 0;
  const ok = (name: string, cond: boolean, extra = "") => {
    console.log(`${cond ? "  ✓" : "  ✗"} ${name}${extra ? ` — ${extra}` : ""}`);
    if (!cond) failures++;
  };

  const { key, cert } = makeKeypair();
  const c = conn(cert);

  // 1. Metadata generation
  const md = metadataXml(c);
  ok("metadata contains ACS URL", md.includes(acsUrl(CONN_ID)));
  ok("metadata declares SP entity id", md.includes(spEntityId(CONN_ID)));

  // 2. Authorize redirect
  const url = await samlFor(c).getAuthorizeUrlAsync("", undefined, {});
  ok("authorize URL points at the IdP", url.startsWith("https://idp.example.com/sso"));
  ok("authorize URL carries a SAMLRequest", /[?&]SAMLRequest=/.test(url));

  // 3. Positive: a validly signed assertion is accepted + identity extracted
  const signed = signAssertion(unsignedResponse("ada@acme.com"), key, cert);
  const b64 = Buffer.from(signed).toString("base64");
  try {
    const { profile } = await samlFor(c).validatePostResponseAsync({ SAMLResponse: b64 });
    ok("signed assertion validates", profile != null);
    const id = profile ? extractIdentity(profile) : { email: "", name: null };
    ok("email extracted", id.email === "ada@acme.com", id.email);
    ok("display name extracted", id.name === "Ada Lovelace", id.name ?? "null");
  } catch (err) {
    ok("signed assertion validates", false, (err as Error).message);
  }

  // 4. Negative: tampering the email after signing must be rejected
  const tampered = Buffer.from(signed.replace("ada@acme.com", "attacker@acme.com")).toString("base64");
  try {
    await samlFor(c).validatePostResponseAsync({ SAMLResponse: tampered });
    ok("tampered assertion rejected", false, "it was accepted!");
  } catch {
    ok("tampered assertion rejected", true);
  }

  // 5. Negative: a response signed by a DIFFERENT cert is rejected
  const other = makeKeypair();
  const foreign = Buffer.from(
    signAssertion(unsignedResponse("ada@acme.com"), other.key, other.cert),
  ).toString("base64");
  try {
    await samlFor(c).validatePostResponseAsync({ SAMLResponse: foreign });
    ok("wrong-signer assertion rejected", false, "it was accepted!");
  } catch {
    ok("wrong-signer assertion rejected", true);
  }

  console.log(failures === 0 ? "\nSAML smoke: ALL PASS" : `\nSAML smoke: ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
