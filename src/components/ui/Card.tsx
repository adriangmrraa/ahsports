import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "primary" | "secondary" | "tertiary" | "error" | "success" | "warning" | "muted";

const tones: Record<Tone, string> = {
  primary: "bg-primary/15 border-primary/40 text-primary",
  secondary: "bg-secondary/15 border-secondary/40 text-secondary",
  tertiary: "bg-tertiary/15 border-tertiary/40 text-tertiary",
  error: "bg-error/15 border-error/40 text-error",
  success: "bg-success/15 border-success/40 text-success",
  warning: "bg-warning/15 border-warning/40 text-warning",
  muted: "bg-surface-container-high border-outline-variant text-on-surface-variant",
};

export function Badge({ tone = "muted", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border text-[11px] font-bold uppercase tracking-wider",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <div className={cn("glass-panel rounded-lg p-5", className)}>
      {(title || action) && (
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-outline-variant">
          {title && <h3 className="font-headline text-lg text-on-surface">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  tone = "primary",
  icon,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div className="glass-panel rounded-lg p-5 flex flex-col justify-between min-h-[140px]">
      <div className="flex justify-between items-start">
        <span className="label-caps text-on-surface-variant">{label}</span>
        {icon && <span className={cn(tones[tone], "p-1.5 rounded")}>{icon}</span>}
      </div>
      <div className="mt-4">
        <span className="font-display text-3xl text-on-surface leading-none">{value}</span>
        {delta && <div className="mt-2 flex items-center gap-1 text-xs text-on-surface-variant data-mono">{delta}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-6 pb-4 border-b border-outline-variant">
      <div>
        <h2 className="font-headline text-2xl md:text-3xl text-on-surface">{title}</h2>
        {subtitle && <p className="data-mono text-on-surface-variant mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex gap-2 flex-wrap">{action}</div>}
    </header>
  );
}

export function EmptyState({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="glass-panel rounded-lg p-10 text-center">
      <p className="label-caps text-primary mb-2">{title}</p>
      {description && <p className="text-sm text-on-surface-variant max-w-md mx-auto mb-4">{description}</p>}
      {action}
    </div>
  );
}