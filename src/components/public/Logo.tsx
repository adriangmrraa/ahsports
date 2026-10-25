import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Marca AH Sports. `onDark` invierte la tinta para cabeceras/pies navy.
 * El bloque "AH" usa el acento ámbar: es el único punto de color fuerte.
 */
export function Logo({
  onDark = false,
  href = "/",
  className,
}: {
  onDark?: boolean;
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="AH Sports, inicio"
      className={cn("group flex shrink-0 items-center gap-2.5", className)}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md font-display text-sm font-black tracking-tight transition-colors",
          onDark
            ? "bg-accent text-on-accent"
            : "bg-primary text-accent",
        )}
      >
        AH
      </span>
      <span
        className={cn(
          "font-display text-lg font-extrabold uppercase tracking-tight",
          onDark ? "text-on-navy" : "text-primary",
        )}
      >
        Sports
      </span>
    </Link>
  );
}
