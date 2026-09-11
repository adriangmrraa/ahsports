import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type TableVariant = "default" | "compact" | "plain";

const tableVariants: Record<TableVariant, { container: string; table: string }> = {
  default: { container: "bg-surface-container-low border border-outline-variant rounded-md", table: "" },
  compact: { container: "bg-surface-container-low border border-outline-variant rounded-md", table: "text-xs" },
  plain: { container: "bg-transparent", table: "" },
};

export function Table({ children, className, variant = "default" }: { children: ReactNode; className?: string; variant?: TableVariant }) {
  return (
    <div className={cn("max-w-full overflow-hidden", tableVariants[variant].container, className)}>
      <div className="overflow-x-auto scrollbar-thin">
        <table className={cn("w-full min-w-[640px] text-left border-collapse", tableVariants[variant].table)}>{children}</table>
      </div>
    </div>
  );
}

export function THead({ children, className }: { children: ReactNode; className?: string }) {
  return <thead className={cn("bg-surface-container text-on-surface-variant border-b border-outline-variant", className)}>{children}</thead>;
}

export function TH({ children, className, align = "left" }: { children: ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <th className={cn("px-3 py-2.5 label-caps font-medium text-on-surface-variant", align === "right" && "text-right", align === "center" && "text-center", className)}>
      {children}
    </th>
  );
}

export function TR({ children, className, href }: { children: ReactNode; className?: string; href?: string }) {
  const classes = cn("border-b border-outline-variant hover:bg-surface-bright/5 transition-colors focus-within:bg-surface-bright/5", className);
  if (href) {
    return (
      <tr className={cn(classes, "cursor-pointer")} onClick={() => (window.location.href = href)}>
        {children}
      </tr>
    );
  }
  return <tr className={classes}>{children}</tr>;
}

export function TD({ children, className, align = "left" }: { children: ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <td className={cn("px-3 py-2.5 data-mono text-on-surface", align === "right" && "text-right", align === "center" && "text-center", className)}>
      {children}
    </td>
  );
}
