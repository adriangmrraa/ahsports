import "server-only";

/**
 * Shared Server-Sent Events plumbing for /api/events/*.
 *
 * `createEventStream` returns a `Response` over a `ReadableStream` that polls
 * the DB on a fixed interval and writes one `data:` frame per emitted event.
 * Polling is serialized (a slow tick never overlaps the next), heartbeats
 * keep proxies from killing the stream, and both `request.signal` abort and
 * stream cancel run the same cleanup so no interval outlives its connection.
 *
 * Neon serves this app over the HTTP driver, so each tick is one lightweight
 * indexed query per open admin tab — acceptable at ~3s.
 */

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export const SSE_POLL_MS = 3_000;
export const SSE_HEARTBEAT_MS = 15_000;

/**
 * How far back a fresh connection looks when it carries no cursor at all.
 * Covers the render → stream-connect gap; clients dedup/merge re-emits.
 */
export const SSE_LOOKBACK_MS = 30_000;

export type SseEvent = {
  /** SSE `id:` field — echoed back as Last-Event-ID on reconnect. */
  id?: string;
  data: unknown;
};

export type SsePoll = () => Promise<readonly SseEvent[]>;

export function createEventStream(
  request: Request,
  label: string,
  poll: SsePoll,
): Response {
  const encoder = new TextEncoder();
  let closed = false;
  let polling = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let cleanup: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      cleanup = () => {
        if (closed) return;
        closed = true;
        if (pollTimer) clearTimeout(pollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // Already closed/errored — nothing left to release.
        }
      };

      const enqueue = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const tick = async (): Promise<void> => {
        if (closed || polling) return;
        polling = true;
        try {
          for (const event of await poll()) {
            const idField = event.id ? `id: ${event.id}\n` : "";
            enqueue(`${idField}data: ${JSON.stringify(event.data)}\n\n`);
          }
        } catch (error) {
          // A transient DB failure must not kill the stream — the next tick
          // (or the client's auto-reconnect) recovers.
          console.error(`[sse:${label}] poll tick failed:`, error);
        } finally {
          polling = false;
          if (!closed) pollTimer = setTimeout(tick, SSE_POLL_MS);
        }
      };

      heartbeatTimer = setInterval(() => enqueue(":hb\n\n"), SSE_HEARTBEAT_MS);
      request.signal.addEventListener("abort", cleanup, { once: true });
      void tick();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
