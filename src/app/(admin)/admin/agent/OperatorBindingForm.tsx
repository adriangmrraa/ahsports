"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bindAgentOperator } from "@/app/actions/agent-config";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";

export type OperatorUserOption = {
  id: string;
  name: string;
  role: string;
};

export function OperatorBindingForm({ users }: { users: OperatorUserOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [channel, setChannel] = useState<"telegram" | "whatsapp">("telegram");
  const [transportId, setTransportId] = useState("");
  const [userId, setUserId] = useState(users[0]?.id ?? "");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const res = await bindAgentOperator({ channel, transportId, userId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTransportId("");
      setSaved(res.bindingKey);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-xs text-on-surface-variant">
        Vincular un remitente del canal (por ejemplo el ID de Telegram del operador) a un usuario autorizado. El
        vínculo se guarda como <code className="data-mono">canal:transportId</code>.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Canal">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as "telegram" | "whatsapp")}>
            <option value="telegram">Telegram</option>
            <option value="whatsapp">WhatsApp</option>
          </Select>
        </Field>
        <Field label="Transport ID" hint="ID del remitente en el canal (ej. 123456789).">
          <Input
            value={transportId}
            onChange={(e) => setTransportId(e.target.value)}
            placeholder="123456789"
            required
          />
        </Field>
        <Field label="Usuario operador">
          <Select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            disabled={users.length === 0}
            required
          >
            {users.length === 0 && <option value="">Sin operadores disponibles</option>}
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.role})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      {saved && <p className="text-sm text-success">Operador vinculado: {saved}</p>}
      <div>
        <Button type="submit" disabled={pending || users.length === 0 || !userId}>
          {pending ? "Vinculando..." : "Vincular operador"}
        </Button>
      </div>
    </form>
  );
}
