import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBlockedSmtpAddress,
  resolveSmtpTarget,
  SMTP_TIMEOUTS,
  smtpErrorReason,
  smtpTransportOptions,
  SmtpGuardError,
} from "./smtp-guard";

const fixed = (...ips: string[]) => async () => ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

describe("isBlockedSmtpAddress", () => {
  const blocked = [
    "127.0.0.1", "127.255.255.254", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "169.254.0.1", "100.64.0.1", "100.127.255.255", "0.0.0.0", "224.0.0.1",
    "255.255.255.255", "192.0.0.192", "198.18.0.1", "168.63.129.16",
    "::", "::1", "fe80::1", "fe80::1%eth0", "fc00::1", "fd00:ec2::254", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe",
    "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "::127.0.0.1", "[::1]", "not-an-ip", "",
  ];
  for (const ip of blocked) it(`blocks ${ip || "(empty)"}`, () => assert.equal(isBlockedSmtpAddress(ip), true));

  const allowed = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2607:f8b0:4004:800::200e", "::ffff:8.8.8.8", "64:ff9b::808:808"];
  for (const ip of allowed) it(`allows ${ip}`, () => assert.equal(isBlockedSmtpAddress(ip), false));
});

describe("resolveSmtpTarget", () => {
  it("returns the vetted IP with the hostname as servername; 465 is implicit TLS", async () => {
    const t = await resolveSmtpTarget("SMTP.Example.com.", 465, { resolve: fixed("8.8.8.8") });
    assert.deepEqual(t, { ip: "8.8.8.8", port: 465, servername: "smtp.example.com", secure: true });
  });

  it("587 and 2525 are STARTTLS", async () => {
    for (const port of [587, 2525]) {
      const t = await resolveSmtpTarget("smtp.example.com", port, { resolve: fixed("8.8.8.8") });
      assert.equal(t.secure, false);
    }
  });

  for (const port of [25, 26, 80, 443, 2526, 6379, 0]) {
    it(`refuses port ${port}`, async () => {
      await assert.rejects(resolveSmtpTarget("smtp.example.com", port, { resolve: fixed("8.8.8.8") }), SmtpGuardError);
    });
  }

  it("refuses when ANY resolved address is private (no mixed record sets)", async () => {
    await assert.rejects(resolveSmtpTarget("smtp.example.com", 587, { resolve: fixed("8.8.8.8", "169.254.169.254") }), /private or reserved/);
  });

  it("refuses IP literals and internal names without resolving", async () => {
    let called = false;
    const spy = async () => { called = true; return [{ address: "8.8.8.8", family: 4 }]; };
    for (const host of ["127.0.0.1", "8.8.8.8", "[::1]", "localhost", "mail.internal", "x.local", "x.localhost", "bad_host!"]) {
      await assert.rejects(resolveSmtpTarget(host, 587, { resolve: spy }), SmtpGuardError, host);
    }
    assert.equal(called, false);
  });

  it("refuses a name that does not resolve", async () => {
    await assert.rejects(resolveSmtpTarget("smtp.example.com", 587, { resolve: fixed() }), /doesn't resolve/);
    await assert.rejects(resolveSmtpTarget("smtp.example.com", 587, { resolve: async () => { throw new Error("ENOTFOUND"); } }), /doesn't resolve/);
  });

  it("times out a hung lookup", { timeout: SMTP_TIMEOUTS.dns + 3000 }, async () => {
    await assert.rejects(resolveSmtpTarget("smtp.example.com", 587, { resolve: () => new Promise(() => {}) }), /timed out/);
  });
});

describe("smtpTransportOptions", () => {
  it("connects to the IP, pins SNI to the name, requires TLS, bounds every step", () => {
    const o = smtpTransportOptions({ ip: "8.8.8.8", port: 587, servername: "smtp.example.com", secure: false }, { user: "u", pass: "p" });
    assert.equal(o.host, "8.8.8.8");
    assert.equal(o.servername, "smtp.example.com");
    assert.equal(o.tls.servername, "smtp.example.com");
    assert.equal(o.tls.rejectUnauthorized, true);
    assert.equal(o.requireTLS, true);
    assert.equal(o.secure, false);
    assert.equal(o.ignoreTLS, false);
    assert.ok(o.connectionTimeout > 0 && o.greetingTimeout > 0 && o.socketTimeout > 0 && o.dnsTimeout > 0);
    assert.equal("ca" in o.tls, false);
    const s = smtpTransportOptions({ ip: "8.8.8.8", port: 465, servername: "smtp.example.com", secure: true }, { user: "u", pass: "p" });
    assert.equal(s.secure, true);
  });
});

describe("smtpErrorReason", () => {
  it("never echoes the password and names the problem", () => {
    assert.match(smtpErrorReason({ code: "EAUTH", responseCode: 535, message: "Invalid login: 535 pass=hunter2" }), /username or password \(535\)/);
    assert.doesNotMatch(smtpErrorReason({ code: "EAUTH", message: "hunter2" }), /hunter2/);
    assert.match(smtpErrorReason({ code: "ETIMEDOUT" }), /timed out/);
    assert.match(smtpErrorReason(new SmtpGuardError("x resolves to a private or reserved address")), /private/);
  });
});
