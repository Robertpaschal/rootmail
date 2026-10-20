import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect, createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { SMTPServer, type SMTPServerOptions } from "smtp-server";
import { sendSmtpRaw, verifySmtpLogin } from "./smtp-client";

// A real SMTP server on loopback, with a throwaway CA generated per run (no key
// material in the repo). Port 2525 is the only allowed port a test can bind
// unprivileged, so STARTTLS is exercised end to end; 465's implicit TLS is
// covered by smtp-guard.test.ts (secure: true).

const HOST = "smtp.test.example";
let dir: string;
let ca: string;
let key: string;
let cert: string;
let wrongCert: string;

function makeCerts() {
  dir = mkdtempSync(join(tmpdir(), "rm-smtp-"));
  const run = (...args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
  run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.crt", "-days", "1", "-subj", "/CN=rm-test-ca");
  for (const [name, cn] of [["good", HOST], ["wrong", "other.example"]] as const) {
    run("req", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", `/CN=${cn}`);
    writeFileSync(join(dir, `${name}.ext`), `subjectAltName=DNS:${cn}\n`);
    run("x509", "-req", "-in", `${name}.csr`, "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", `${name}.crt`, "-days", "1", "-extfile", `${name}.ext`);
  }
  ca = readFileSync(join(dir, "ca.crt"), "utf8");
  key = readFileSync(join(dir, "good.key"), "utf8");
  cert = readFileSync(join(dir, "good.crt"), "utf8");
  wrongCert = readFileSync(join(dir, "wrong.crt"), "utf8");
}

interface Seen { sni: string[]; mailFrom: string[]; rcpt: string[]; data: string[]; secureAtAuth: boolean[] }

async function startServer(opts: Partial<SMTPServerOptions> = {}): Promise<{ port: number; seen: Seen; close: () => Promise<void> }> {
  const seen: Seen = { sni: [], mailFrom: [], rcpt: [], data: [], secureAtAuth: [] };
  const server = new SMTPServer({
    key: opts.key ?? key,
    cert: opts.cert ?? cert,
    authMethods: ["PLAIN", "LOGIN"],
    logger: false,
    closeTimeout: 100,
    SNICallback: (servername, cb) => {
      seen.sni.push(servername);
      cb(null, undefined as never);
    },
    onAuth(auth, session, cb) {
      seen.secureAtAuth.push(Boolean(session.secure));
      if (auth.username === "tenant" && auth.password === "s3cret pass") return cb(null, { user: "tenant" });
      return cb(Object.assign(new Error("Invalid login"), { responseCode: 535 }));
    },
    onMailFrom(a, _s, cb) { seen.mailFrom.push(a.address); cb(); },
    onRcptTo(a, _s, cb) { seen.rcpt.push(a.address); cb(); },
    onData(stream, _s, cb) {
      let buf = "";
      stream.on("data", (c: Buffer) => (buf += c.toString()));
      stream.on("end", () => { seen.data.push(buf); cb(); });
    },
    ...opts,
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.server.address() as AddressInfo).port;
  return { port, seen, close: () => new Promise((r) => server.close(() => r())) };
}

/** Loopback is what the guard exists to block, so these tests open exactly that door, nothing else. */
const hooksFor = () => ({
  resolve: async () => [{ address: "127.0.0.1", family: 4 }],
  isBlocked: () => false,
  testCa: ca,
});

// The guard only accepts 465/587/2525, but the test server binds an ephemeral
// port. Route 2525 to it with a tiny TCP forwarder.
async function forward2525(to: number): Promise<{ close: () => Promise<void> } | null> {
  const open = new Set<Socket>();
  const srv: Server = createServer((c) => {
    const up = connect(to, "127.0.0.1");
    open.add(c).add(up);
    c.pipe(up).pipe(c);
    c.on("error", () => up.destroy());
    up.on("error", () => c.destroy());
  });
  try {
    await new Promise<void>((res, rej) => { srv.once("error", rej); srv.listen(2525, "127.0.0.1", res); });
  } catch {
    return null;
  }
  return {
    close: () => new Promise((r) => {
      for (const sock of open) sock.destroy();
      srv.close(() => r());
    }),
  };
}

const login = { host: HOST, port: 2525, username: "tenant", password: "s3cret pass" };

describe("tenant SMTP (real server on loopback)", () => {
  before(makeCerts);
  after(() => rmSync(dir, { recursive: true, force: true }));

  async function withServer(opts: Partial<SMTPServerOptions>, fn: (s: Awaited<ReturnType<typeof startServer>>) => Promise<void>) {
    const s = await startServer(opts);
    const fwd = await forward2525(s.port);
    if (!fwd) { await s.close(); throw new Error("port 2525 busy on this machine"); }
    try { await fn(s); } finally { await fwd.close(); await s.close(); }
  }

  it("verify: STARTTLS with SNI = hostname, AUTH over TLS, and NO message sent", async () => {
    await withServer({}, async (s) => {
      const r = await verifySmtpLogin(login, hooksFor());
      assert.deepEqual(r, { ok: true });
      assert.deepEqual(s.seen.sni, [HOST]);
      assert.deepEqual(s.seen.secureAtAuth, [true]);
      assert.equal(s.seen.mailFrom.length, 0);
      assert.equal(s.seen.data.length, 0);
    });
  });

  it("send: envelope sender is the tenant's From (DSNs go to them), body is ours byte for byte", async () => {
    await withServer({}, async (s) => {
      const raw = "From: a@acme.test\r\nTo: b@x.test\r\nSubject: hi\r\nList-Unsubscribe: <https://u>\r\nMessage-ID: <m1@acme.test>\r\n\r\nbody\r\n";
      await sendSmtpRaw(login, { from: "a@acme.test", to: "b@x.test" }, raw, hooksFor());
      assert.deepEqual(s.seen.mailFrom, ["a@acme.test"]);
      assert.deepEqual(s.seen.rcpt, ["b@x.test"]);
      assert.match(s.seen.data[0]!, /List-Unsubscribe: <https:\/\/u>/);
      assert.match(s.seen.data[0]!, /Message-ID: <m1@acme.test>/);
    });
  });

  it("refuses a server that doesn't offer STARTTLS (no plaintext AUTH)", async () => {
    await withServer({ disabledCommands: ["STARTTLS"], allowInsecureAuth: true }, async (s) => {
      const r = await verifySmtpLogin(login, hooksFor());
      assert.equal(r.ok, false);
      assert.equal(s.seen.secureAtAuth.length, 0);
    });
  });

  it("refuses a certificate for a different name", async () => {
    await withServer({ cert: wrongCert, key: readFileSync(join(dir, "wrong.key"), "utf8") }, async (s) => {
      const r = await verifySmtpLogin(login, hooksFor());
      assert.equal(r.ok, false);
      assert.equal(s.seen.secureAtAuth.length, 0);
    });
  });

  it("refuses an untrusted certificate (no test CA → system store only)", async () => {
    await withServer({}, async (s) => {
      const { testCa: _drop, ...noCa } = hooksFor();
      const r = await verifySmtpLogin(login, noCa);
      assert.equal(r.ok, false);
    });
  });

  it("wrong password: a clear reason that doesn't echo the password", async () => {
    await withServer({}, async (s) => {
      const r = await verifySmtpLogin({ ...login, password: "nope-hunter2" }, hooksFor());
      assert.equal(r.ok, false);
      assert.match((r as { reason: string }).reason, /username or password/);
      assert.doesNotMatch((r as { reason: string }).reason, /hunter2/);
    });
  });

  it("DNS rebinding: with the REAL guard, a name now resolving to loopback is refused before connecting", async () => {
    await withServer({}, async (s) => {
      const { isBlocked: _real, ...hooks } = hooksFor();
      const r = await verifySmtpLogin(login, hooks);
      assert.equal(r.ok, false);
      assert.match((r as { reason: string }).reason, /private or reserved/);
      await assert.rejects(sendSmtpRaw(login, { from: "a@acme.test", to: "b@x.test" }, "x", hooks), /private or reserved/);
      assert.equal(s.seen.sni.length, 0);
    });
  });
});

describe("absolute deadline", () => {
  it("a server that trickles its greeting can't hold the connection past the deadline", async () => {
    // Sends a 220- continuation line every 300ms forever: each step stays under
    // nodemailer's per-step timeouts, so only our absolute deadline ends it.
    const open = new Set<Socket>();
    const trickle = createServer((c) => {
      open.add(c);
      const t = setInterval(() => c.write("220-still here\r\n"), 300);
      c.on("close", () => { clearInterval(t); open.delete(c); });
      c.on("error", () => clearInterval(t));
    });
    await new Promise<void>((r) => trickle.listen(0, "127.0.0.1", r));
    const fwd = await forward2525((trickle.address() as AddressInfo).port);
    assert.ok(fwd, "port 2525 free");
    try {
      const started = Date.now();
      const r = await verifySmtpLogin(login, { ...hooksFor(), deadlineMs: 1500 });
      assert.equal(r.ok, false);
      assert.match((r as { reason: string }).reason, /took longer than 2s|took longer than 1s/);
      assert.ok(Date.now() - started < 4000);
    } finally {
      await fwd!.close();
      for (const c of open) c.destroy();
      await new Promise<void>((r) => trickle.close(() => r()));
    }
  });
});
