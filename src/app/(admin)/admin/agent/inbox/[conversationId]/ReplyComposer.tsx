"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { sendReply } from "@/app/actions/inbox";
import { Button } from "@/components/ui/Button";

/**
 * E-01 — operator reply composer. Sends the text into the conversation's own
 * channel/account; the outbound fact is persisted (queued → sent/failed) so a
 * failed send is still visible in the timeline.
 */
export function ReplyComposer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await sendReply({ conversationId, text: trimmed });
        if (result.ok) {
          setText("");
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("No se pudo enviar la respuesta.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribí una respuesta para el cliente…"
        rows={3}
        maxLength={4000}
        required
        className="w-full resize-none rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <div className="flex items-center justify-end gap-3">
        {error ? <span className="text-xs text-error">{error}</span> : null}
        <Button type="submit" variant="primary" disabled={isPending || !text.trim()}>
          {isPending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
    </form>
  );
}
