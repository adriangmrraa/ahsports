import { HelpCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Helper text shown under a control (or inline in a section).
 * Use `Field`'s `hint` prop for regular form fields; reach for this when the
 * control is not wrapped by `Field`.
 */
export function FieldHint({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <p className={cn("text-xs text-on-surface-variant leading-snug", className)} title={title}>
      {children}
    </p>
  );
}

/**
 * Small inline affordance for secondary detail. Uses the native `title`
 * tooltip so it stays accessible and works without JavaScript.
 */
export function HelpTip({ text, className }: { text: string; className?: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      role="img"
      className={cn("inline-flex items-center text-on-surface-variant hover:text-primary cursor-help", className)}
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </span>
  );
}
