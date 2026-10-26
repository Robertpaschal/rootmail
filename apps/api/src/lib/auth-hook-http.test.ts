import assert from "node:assert/strict";
import { test } from "node:test";
import { request as nodeRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { createAuthHookServer } from "./auth-hook-http";

test("dedicated hook listener preserves signed raw bytes and refuses duplicate headers", async () => {
  const seen: string[] = [];
  const server = createAuthHookServer(async request => {
    seen.push(await request.text());
    assert.equal(request.headers.get("webhook-id"), "fixture");
    return Response.json({});
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${origin}/health`)).status, 200);
    assert.equal((await fetch(`${origin}/v1/hooks/supabase/sprout`)).status, 405);
    assert.equal((await fetch(`${origin}/v1/hooks/supabase/sprout?token=fixture`)).status, 404);
    const raw = '{ "space": "kept", "code": "fixture" }';
    const response = await fetch(`${origin}/v1/hooks/supabase/sprout`, { method: "POST",
      headers: { "content-type": "application/json", "webhook-id": "fixture" }, body: raw });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(seen, [raw]);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = nodeRequest(`${origin}/v1/hooks/supabase/sprout`, { method: "POST",
        headers: ["content-type", "application/json", "webhook-id", "fixture", "webhook-id", "duplicate"] },
      res => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
      req.on("error", reject); req.end(raw);
    });
    assert.equal(status, 400);
    assert.equal(seen.length, 1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("listener never exposes thrown secret-bearing errors", async () => {
  const server = createAuthHookServer(async () => { throw new Error("fixture-secret"); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/hooks/supabase/sprout`, { method: "POST", body: "{}" });
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes("fixture-secret"));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
