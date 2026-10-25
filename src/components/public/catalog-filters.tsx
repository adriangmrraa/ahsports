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

  const pill = (active: boolean) =>
    cn(
      "label-caps inline-flex min-h-9 items-center gap-1.5 rounded-full border px-4 transition-all duration-200 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus",
      active
        ? "border-primary bg-primary text-on-primary shadow-md shadow-navy-950/15"
        : "border-outline-variant bg-surface-container text-on-surface-variant hover:border-primary/50 hover:text-primary",
    );

  return (
    <div className="mb-10 flex flex-col gap-5 animate-rise" style={{ animationDelay: "80ms" }}>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o descripción…"
          aria-label="Buscar en el catálogo"
          className="min-h-12 w-full rounded-full border border-outline-variant bg-surface-container pl-11 pr-11 text-sm text-on-surface shadow-sm transition placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30"
        />
        {q && (
          <button
            type="button"
            onClick={() => { setQ(""); push("", cat); }}
            aria-label="Limpiar búsqueda"
            className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface"
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
            className={pill(cat === "")}
          >
            Todo
          </button>
          {categories.map((c, i) => (
            <button
              key={c.value}
              type="button"
              onClick={() => pickCategory(c.value)}
              aria-pressed={cat === c.value}
              className={cn(pill(cat === c.value), "animate-rise")}
              style={{ animationDelay: `${100 + i * 45}ms` }}
            >
              {cat === c.value && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
