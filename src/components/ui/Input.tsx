import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

type ControlVariant = "default" | "filled" | "minimal";
type ControlSize = "sm" | "md" | "lg";

const controlVariants: Record<ControlVariant, string> = {
  default: "bg-surface-container-low border-outline-variant",
  filled: "bg-surface-container border-transparent",
  minimal: "bg-transparent border-transparent border-b-outline-variant rounded-none",
};

const controlSizes: Record<ControlSize, string> = {
  sm: "min-h-8 px-2.5 py-1.5",
  md: "min-h-10 px-3 py-2",
  lg: "min-h-11 px-3.5 py-2.5",
};

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { variant?: ControlVariant; controlSize?: ControlSize };
type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { variant?: ControlVariant; controlSize?: ControlSize };

const controlBase = "w-full rounded-md border text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-focus/30 transition-colors text-sm disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, variant = "default", controlSize = "md", ...props }: InputProps) {
  return (
    <input
      {...props}
      className={cn(
        controlBase,
        controlVariants[variant],
        controlSizes[controlSize],
        className,
      )}
    />
  );
}

export function Textarea({ className, variant = "default", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { variant?: ControlVariant }) {
  return (
    <textarea
      {...props}
      className={cn(
        controlBase,
        controlVariants[variant],
        "min-h-[80px] px-3 py-2",
        className,
      )}
    />
  );
}

export function Select({ className, children, variant = "default", controlSize = "md", ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={cn(
        controlBase,
        controlVariants[variant],
        controlSizes[controlSize],
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("label-caps text-content-secondary block mb-1.5", className)}>
      {children}
    </label>
  );
}

export function Field({ label, htmlFor, children, hint, error }: { label: ReactNode; htmlFor?: string; children: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-on-surface-variant">{hint}</p>}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
