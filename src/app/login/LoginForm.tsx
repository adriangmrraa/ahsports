"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Credenciales inválidas");
      setPending(false);
      return;
    }
    window.location.href = "/admin";
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label-caps text-on-surface-variant block mb-1.5">Email</label>
        <Input type="email" name="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label-caps text-on-surface-variant block mb-1.5">Contraseña</label>
        <Input type="password" name="password" required autoComplete="current-password" />
      </div>
      {error && <p className="text-sm text-error bg-error/10 border border-error/30 px-3 py-2 rounded">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}