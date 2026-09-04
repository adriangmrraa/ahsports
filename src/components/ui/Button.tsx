import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "tertiary";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-gradient-to-r from-primary-container to-cyan-700 text-white hover:opacity-90",
  secondary: "bg-transparent border border-outline-variant text-on-surface hover:border-primary hover:text-primary",
  ghost: "bg-transparent text-on-surface-variant hover:text-primary",
  danger: "bg-error/20 border border-error/50 text-error hover:bg-error/30",
  tertiary: "bg-surface-container-high text-on-surface border border-outline-variant hover:border-primary",
};

const sizes: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5",
  md: "text-sm px-4 py-2",
  lg: "text-base px-5 py-2.5",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={cn(
        "rounded-md font-label-caps transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Link
      href={href}
      {...props}
      className={cn(
        "rounded-md font-label-caps transition-all duration-150 flex items-center justify-center gap-2",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}