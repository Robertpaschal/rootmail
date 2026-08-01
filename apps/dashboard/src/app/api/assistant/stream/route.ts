import { getClientScopeId } from "@/lib/client-scope";
import { API_URL } from "@/lib/rootmail";
import { getSessionToken } from "@/lib/session";

/**
 * The one place the browser talks to the API through the dashboard.
 *
 * Everything else here is server-rendered and calls the API from a Server
 * Component or Action, so the session never leaves the server. Streaming can't
 * work that way — a Server Action returns one value, and the whole point is the
 * events arriving as they happen.
 *
 * So this is a thin pipe rather than an exception to the rule: the browser POSTs
 * here with no credentials of its own, this handler attaches the httpOnly
 * session (and the acting-as-client scope) server-side, and streams the API's
 * response straight back. The token still never reaches the client, and the
 * `rm_session` cookie stays httpOnly and host-only.
 */

export const runtime = "nodejs";
// Buffering anywhere in the chain would hold every event until the run finished,
// which is exactly the behaviour this replaces.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const token = await getSessionToken();
  if (!token) return new Response("Not signed in.", { status: 401 });

  let body: { chatId?: string; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request.", { status: 400 });
  }
  const { chatId, prompt } = body;
  if (!chatId || !prompt) return new Response("chatId and prompt are required.", { status: 400 });

  const scope = await getClientScopeId();
  const upstream = await fetch(
    `${API_URL}/v1/assistant/chats/${encodeURIComponent(chatId)}/messages/stream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(scope ? { "X-Rootmail-Subtenant": scope } : {}),
      },
      body: JSON.stringify({ prompt }),
      cache: "no-store",
      // Let the client abort (navigate away, hit stop) and have that reach the API.
      signal: req.signal,
    },
  );

  if (!upstream.ok || !upstream.body) {
    // A refusal arrives as JSON, not SSE — pass its meaning through rather than
    // leaving the caller with a silent dead stream.
    const text = await upstream.text().catch(() => "");
    return new Response(text || "The assistant is unavailable.", {
      status: upstream.status || 502,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "text/plain" },
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
