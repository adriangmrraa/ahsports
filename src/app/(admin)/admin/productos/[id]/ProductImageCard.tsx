"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ImagePlus, Trash2 } from "lucide-react";

export function ProductImageCard({ productId, imageUrl, name }: { productId: string; imageUrl: string | null; name: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function upload(file: File) {
    setError(null);
    const body = new FormData();
    body.set("file", file);
    startTransition(async () => {
      const res = await fetch(`/api/products/${productId}/image`, { method: "POST", body });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error subiendo la imagen");
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/products/${productId}/image`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error quitando la imagen");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card title="Imagen del producto" action={imageUrl ? (
      <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
        <Trash2 className="w-3.5 h-3.5" /> Quitar
      </Button>
    ) : undefined}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
      {imageUrl ? (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={pending}
          className="group relative w-full overflow-hidden rounded-md border border-outline-variant bg-surface-container-low transition hover:border-primary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          title="Cambiar imagen">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={name} className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
          <span className="absolute inset-x-0 bottom-0 bg-surface/70 px-3 py-2 text-center text-xs text-on-surface opacity-0 backdrop-blur transition group-hover:opacity-100">
            {pending ? "Subiendo..." : "Cambiar imagen"}
          </span>
        </button>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={pending}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-outline-variant bg-surface-container-low px-4 py-10 text-on-surface-variant transition hover:border-primary/60 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
          <ImagePlus className="w-6 h-6" />
          <span className="text-sm">{pending ? "Subiendo..." : "Subir imagen"}</span>
          <span className="text-xs">PNG, JPG, WebP o SVG · máx. 5MB</span>
        </button>
      )}
      <p className="mt-3 text-xs text-on-surface-variant">Se muestra en el catálogo público.</p>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </Card>
  );
}
