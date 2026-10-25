"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Catálogo filter bar: free-text search + subcategory pills. State lives in
 * the URL (`?q=` / `?cat=`) so filtered views are shareable and the page
 * stays a server component doing the real filtering.
 */
export function CatalogFilters({
  categories,
  initialQ,
  initialCat,
}: {
  categories: { value: string; label: string }[];
  initialQ: string;
  initialCat: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initialQ);
  const [cat, setCat] = useState(initialCat);
  const [, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(nextQ: string, nextCat: string) {
    const params = new URLSearchParams();
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextCat) params.set("cat", nextCat);
    const url = params.size ? `${pathname}?${params.toString()}` : pathname;
    startTransition(() => router.replace(url, { scroll: false }));
  }

  useEffect(() => {
    if (q === initialQ) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => push(q, cat), 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function pickCategory(value: string) {
    const next = value === cat ? "" : value;
    setCat(next);
    if (debounce.current) clearTimeout(debounce.current);
    push(q, next);
  }

  return (
    <div className="mb-8 flex flex-col gap-4 animate-rise" style={{ animationDelay: "80ms" }}>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o descripción…"
          aria-label="Buscar en el catálogo"
          className="min-h-11 w-full rounded-full border border-outline-variant bg-surface-container pl-10 pr-10 text-sm text-on-surface placeholder:text-on-surface-variant/60 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30"
        />
        {q && (
          <button
            type="button"
            onClick={() => { setQ(""); push("", cat); }}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
          <button
            type="button"
            onClick={() => pickCategory("")}
            aria-pressed={cat === ""}
            className={cn(
              "min-h-9 rounded-full border px-4 text-xs font-semibold transition active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus",
              cat === ""
                ? "border-primary bg-primary text-on-primary"
                : "border-outline-variant bg-surface-container text-on-surface-variant hover:border-outline hover:text-on-surface",
            )}
          >
            Todo
          </button>
          {categories.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => pickCategory(c.value)}
              aria-pressed={cat === c.value}
              className={cn(
                "min-h-9 rounded-full border px-4 text-xs font-semibold transition active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus",
                cat === c.value
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant bg-surface-container text-on-surface-variant hover:border-outline hover:text-on-surface",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
