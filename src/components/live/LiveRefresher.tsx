"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEventStream } from "@/lib/live/useEventStream";

/**
 * Mounts an SSE endpoint and calls `router.refresh()` — debounced so bursts
 * coalesce into one server re-render — whenever the stream reports new data.
 *
 * Use on server-rendered list pages with no client-side copy of the rows.
 * Surfaces that keep local state (timeline, inbox table, kanban) subscribe
 * to the stream directly and merge instead — `refresh()` would not reach
 * their `useState` anyway.
 */
export function LiveRefresher({
  endpoint,
  debounceMs = 500,
}: {
  endpoint: string;
  debounceMs?: number;
}) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEventStream(endpoint, () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => router.refresh(), debounceMs);
  });

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return null;
}
