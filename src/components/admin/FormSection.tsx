import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Groups related form controls and states, in one line, what the section is
 * for. Keeps long forms legible without adding walls of text.
 */
export function FormSection({
  title,
  purpose,
  children,
  className,
  action,
}: {
  title: ReactNode;
  purpose?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("rounded-md border border-outline-variant bg-surface-container-low p-4 space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-on-surface">{title}</p>
          {purpose && <p className="text-xs text-on-surface-variant mt-0.5 leading-snug">{purpose}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
