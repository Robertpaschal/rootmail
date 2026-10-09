import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { SIGNED_IN_HOME } from "./home";
import { verifyOutcomeCopy } from "./verify-email-copy";

const visit = (path: string, cookie?: string) =>
  middleware(new NextRequest(new URL(`https://app.rootmail.io${path}`), { headers: cookie ? { cookie } : {} }));
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1" && !res.headers.get("location");

describe("email links and the session", () => {
  it("opens the verify link without a session instead of bouncing to /login and losing the token", () => {
    assert.ok(passes(visit("/verify-email?token=abc")));
  });

  it("opens the verify link with a session, and never clears or rewrites the session cookie", () => {
    const res = visit("/verify-email?token=abc", "rm_session=tok; rm_signed_in=1");
    assert.ok(passes(res));
    const set = res.headers.get("set-cookie") ?? "";
    assert.doesNotMatch(set, /rm_session=/);
    assert.doesNotMatch(set, /rm_signed_in=;/);
  });

  it("leaves password reset exactly as on main: hidden /forgot-password and /reset-password stay behind /login", () => {
    for (const path of ["/forgot-password", "/reset-password?token=abc", "/verify-email/extra"]) {
      const res = visit(path);
      assert.equal(res.status, 307, path);
      assert.match(res.headers.get("location") ?? "", /^https:\/\/app\.rootmail\.io\/login(\?|$)/, path);
    }
  });

  it("still guards the app", () => {
    const res = visit("/settings");
    assert.equal(res.status, 307);
    assert.equal(res.headers.get("location"), "https://app.rootmail.io/login");
  });

  it("still sends signed-in visitors of /login home", () => {
    assert.equal(visit("/login", "rm_session=tok").headers.get("location"), `https://app.rootmail.io${SIGNED_IN_HOME}`);
  });

  it("sends signed-out visitors to sign in after verifying; an email link is never a login", () => {
    assert.equal(verifyOutcomeCopy("verified", false).href, "/login");
    assert.equal(verifyOutcomeCopy("verified", true).href, "/");
    assert.equal(verifyOutcomeCopy("failed", false).href, "/login");
  });
});
