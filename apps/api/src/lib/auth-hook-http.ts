import { createServer } from "node:http";
import { Readable } from "node:stream";

/** Dedicated hook listener: no access/body logging or ordinary API middleware. */
export function createAuthHookServer(hook: (request: Request) => Promise<Response>) {
  const server = createServer(async (req, res) => {
    res.setHeader("cache-control", "no-store");
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" }).end('{"status":"ok"}');
      return;
    }
    if (req.url !== "/v1/hooks/supabase/sprout") { res.writeHead(404).end(); return; }
    if (req.method !== "POST") { res.writeHead(405, { allow: "POST" }).end(); return; }
    const controller = new AbortController();
    const abort = () => controller.abort();
    const closed = () => { if (!res.writableEnded) abort(); };
    req.once("aborted", abort);
    res.once("close", closed);
    try {
      const headers = new Headers();
      // Do not let Node merge duplicate signature headers into a different value.
      const seen = new Set<string>();
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i].toLowerCase();
        if (!name.startsWith("webhook-") && name !== "content-type" && name !== "content-length") continue;
        if (seen.has(name)) { res.writeHead(400).end(); return; }
        seen.add(name); headers.set(name, req.rawHeaders[i + 1]);
      }
      const request = new Request("https://hook.invalid/v1/hooks/supabase/sprout", {
        method: "POST", headers, signal: controller.signal,
        body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: "half",
      } as RequestInit);
      const response = await hook(request);
      if (controller.signal.aborted) return;
      // The adapter only emits bounded, fixed JSON. Never reflect request headers.
      res.writeHead(response.status, { "content-type": "application/json" }).end(await response.text());
    } catch {
      if (!res.headersSent && !res.destroyed) res.writeHead(503).end('{"error":"authentication_email_unconfirmed"}');
    } finally {
      req.off("aborted", abort); res.off("close", closed);
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 5000;
  server.timeout = 6000;
  server.maxHeadersCount = 32;
  server.maxConnections = 16;
  server.on("clientError", (_error, socket) => socket.destroy());
  return server;
}
