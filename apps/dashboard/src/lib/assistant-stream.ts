/**
 * Reads the assistant's SSE run from the dashboard's own proxy route.
 *
 * Deliberately hand-rolled rather than EventSource: EventSource is GET-only and
 * can't carry a prompt body, and this needs to be abortable so a user who
 * navigates away or presses stop actually cancels the run.
 *
 * Frames are `event: <name>\ndata: <json>\n\n`. The only subtlety is that a
 * chunk boundary can land mid-frame, so anything after the last blank line is
 * held back until the rest arrives — splitting eagerly would corrupt long
 * deltas, which is precisely where the boundaries fall.
 */

export interface StreamedAction {
  tool: string;
  status: number;
}

export interface AssistantDone {
  reply: string;
  actions: StreamedAction[];
  source: string;
  chat: { id: string; title: string };
  credits: { used: number; allowance: number } | null;
}

export interface StreamHandlers {
  /** A chunk of the model's prose, as it's written. */
  onDelta?: (text: string) => void;
  /** A tool finished. */
  onTool?: (a: StreamedAction) => void;
  onDone?: (d: AssistantDone) => void;
  onError?: (message: string) => void;
}

export async function streamAssistant(
  chatId: string,
  prompt: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/assistant/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, prompt }),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    handlers.onError?.("Couldn't reach the assistant.");
    return;
  }

  if (res.status === 401) {
    handlers.onError?.("You've been signed out. Sign in again and your chats will be here.");
    return;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    // The API's error envelope is {error:{message}}; fall back to raw text.
    let message = text || "The assistant is unavailable.";
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed?.error?.message) message = parsed.error.message;
    } catch {
      /* not JSON — use the text as-is */
    }
    handlers.onError?.(message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Keep the trailing partial frame in the buffer.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const nameLine = frame.split("\n").find((l) => l.startsWith("event: "));
        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!nameLine || !dataLine) continue;
        const name = nameLine.slice(7).trim();
        let data: unknown;
        try {
          data = JSON.parse(dataLine.slice(6));
        } catch {
          continue;
        }
        if (name === "delta") handlers.onDelta?.((data as { text: string }).text);
        else if (name === "tool") handlers.onTool?.(data as StreamedAction);
        else if (name === "done") {
          sawDone = true;
          handlers.onDone?.(data as AssistantDone);
        } else if (name === "error") {
          sawDone = true;
          handlers.onError?.((data as { error: string }).error);
        }
      }
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    handlers.onError?.("The connection dropped before the assistant finished.");
    return;
  }

  // The socket closed without a terminal frame — the run died somewhere we can't
  // see. Say so rather than leaving the composer stuck pending forever.
  if (!sawDone && !signal?.aborted) {
    handlers.onError?.("The assistant stopped unexpectedly. Nothing was charged.");
  }
}
