"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";

import { retryDlqJob } from "@/app/actions/dlq";

/**
 * Per-row DLQ retry trigger — calls the `retryDlqJob` server action and
 * surfaces its discriminated result inline (channels-view convention). On
 * success the action revalidates the page and the row leaves the list.
 */
export function DlqRetryButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function retry() {
    startTransition(async () => {
      setError(null);
      const res = await retryDlqJob({ id: jobId });
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        className="label-caps text-xs px-3 py-1.5 rounded-md border border-outline-variant text-primary hover:border-primary hover:bg-primary/10 transition-colors inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RotateCcw className="w-3.5 h-3.5" /> {pending ? "Reencolando…" : "Reintentar"}
      </button>
      {error && <span className="text-xs text-error max-w-40 text-right">{error}</span>}
    </span>
  );
}
