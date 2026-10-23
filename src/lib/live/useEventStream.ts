"use client";

import { useEffect, useRef } from "react";

/**
 * EventSource wrapper for the /api/events/* streams.
 *
 * The browser already auto-reconnects SSE and replays `Last-Event-ID`, so
 * this hook only owns the lifecycle: open on mount/endpoint change, JSON-parse
 * each `data:` frame, close on unmount. `onEvent` is kept in a ref so callers
 * can pass a fresh inline closure without churning the connection.
 */
export type EventStreamHandler = (data: unknown, event: MessageEvent<string>) => void;

export function useEventStream(endpoint: string | null, onEvent: EventStreamHandler): void {
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    if (!endpoint) return;
    const source = new EventSource(endpoint);
    source.onmessage = (event) => {
      let data: unknown = event.data;
      try {
        data = JSON.parse(event.data);
      } catch {
        // Non-JSON frames (e.g. heartbeats are comments and never reach this)
        // surface as raw text; handlers decide what to do with them.
      }
      handlerRef.current(data, event);
    };
    return () => source.close();
  }, [endpoint]);
}
