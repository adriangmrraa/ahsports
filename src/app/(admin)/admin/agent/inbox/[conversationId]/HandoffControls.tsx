"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resolveHandoff, toggleHumanOverride } from "@/app/actions/inbox";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";

/**
 * E-02/E-03 — human-override controls for the conversation.
 * "Tomar control" sets the 24h override marker (same key/TTL the agent's
 * transferToHuman writes); "Devolver al agente" / "Marcar resuelto" clear it
 * immediately so the agent resumes on the next inbound.
 */
export function HandoffControls({
  conversationId,
  overrideActive,
}: {
  conversationId: string;
  overrideActive: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) setError(result.error ?? "No se pudo completar la acción.");
        router.refresh();
      } catch {
        setError("No se pudo completar la acción.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge tone={overrideActive ? "warning" : "muted"}>
          {overrideActive ? "Control humano" : "Agente activo"}
        </Badge>
        {error ? <span className="text-xs text-error">{error}</span> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => run(() => toggleHumanOverride({ conversationId, enabled: !overrideActive }))}
        >
          {overrideActive ? "Devolver al agente" : "Tomar control"}
        </Button>
        {overrideActive ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => run(() => resolveHandoff({ conversationId }))}
          >
            Marcar resuelto
          </Button>
        ) : null}
      </div>
    </div>
  );
}
