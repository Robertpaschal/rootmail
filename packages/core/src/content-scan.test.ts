import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkHosts, scanContent } from "./content-scan";

// Content scanning. Every rule here has a definite answer — the value is as much
// in what it does NOT flag, because a control that refuses honest mail is one
// people learn to route around.

describe("executable attachments", () => {
  it("refuses the obvious ones", () => {
    for (const f of ["invoice.exe", "setup.msi", "macro.vbs", "run.bat", "app.jar"]) {
      const found = scanContent({ attachments: [{ filename: f }] });
      assert.equal(found.length, 1, f);
      assert.equal(found[0].kind, "attachment_type");
    }
  });

  it("is case-insensitive and ignores trailing dots and spaces", () => {
    // "invoice.EXE." and "invoice.exe " are the same file to Windows, and both
    // are how this gets smuggled past a naive endsWith check.
    for (const f of ["invoice.EXE", "invoice.exe ", "invoice.Exe."]) {
      assert.equal(scanContent({ attachments: [{ filename: f }] }).length, 1, f);
    }
  });

  it("catches a double extension", () => {
    assert.equal(scanContent({ attachments: [{ filename: "invoice.pdf.exe" }] }).length, 1);
  });

  it("lets ordinary documents through", () => {
    for (const f of ["invoice.pdf", "photo.png", "report.docx", "data.csv", "archive.zip"]) {
      assert.deepEqual(scanContent({ attachments: [{ filename: f }] }), [], f);
    }
  });

  it("ignores a filename with no extension", () => {
    assert.deepEqual(scanContent({ attachments: [{ filename: "README" }] }), []);
  });
});

describe("blocked links", () => {
  const blocked = ["bad.example", "phish.test"];

  it("flags an exact host", () => {
    const f = scanContent({ html: '<a href="https://bad.example/x">click</a>', blockedHosts: blocked });
    assert.equal(f.length, 1);
    assert.equal(f[0].kind, "blocked_link");
  });

  it("flags a subdomain of a blocked host", () => {
    const f = scanContent({ html: '<a href="https://login.bad.example/x">click</a>', blockedHosts: blocked });
    assert.equal(f.length, 1);
  });

  it("does NOT flag a host that merely ends in the same letters", () => {
    // notbad.example is a different domain from bad.example — the same mistake
    // the SES-id matcher made before it required the dot.
    assert.deepEqual(
      scanContent({ html: '<a href="https://notbad.example/x">click</a>', blockedHosts: blocked }),
      [],
    );
  });

  it("flags nothing when no hosts are blocked", () => {
    assert.deepEqual(scanContent({ html: '<a href="https://bad.example/x">hi</a>' }), []);
  });
});

describe("what it deliberately does not do", () => {
  it("allows link text that names a different domain than the href", () => {
    // The classic phishing tell — and also exactly what click tracking produces,
    // on this platform and every other. Flagging it would refuse honest mail.
    assert.deepEqual(
      scanContent({ html: '<a href="https://track.rootmail.io/c/abc">example.com</a>' }),
      [],
    );
  });

  it("does not guess from wording", () => {
    assert.deepEqual(
      scanContent({ html: "<p>Verify your account password immediately or it will be closed.</p>" }),
      [],
    );
  });
});

describe("link extraction", () => {
  it("finds each distinct host once", () => {
    const hosts = linkHosts('<a href="https://a.com/1">x</a><a href="https://a.com/2">y</a><a href="http://b.com">z</a>');
    assert.deepEqual(hosts.sort(), ["a.com", "b.com"]);
  });

  it("ignores mailto, tel and unparseable hrefs", () => {
    assert.deepEqual(linkHosts('<a href="mailto:a@b.com">m</a><a href="tel:+1">t</a><a href="{{url}}">v</a>'), []);
  });
});
