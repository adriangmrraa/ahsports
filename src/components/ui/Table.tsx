import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("glass-panel rounded-lg overflow-hidden", className)}>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left border-collapse">{children}</table>
      </div>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-container text-on-surface-variant border-b border-outline-variant">{children}</thead>;
}

export function TH({ children, className, align = "left" }: { children: ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <th className={cn("p-3 label-caps font-medium text-on-surface-variant", align === "right" && "text-right", align === "center" && "text-center", className)}>
      {children}
    </th>
  );
}

export function TR({ children, className, href }: { children: ReactNode; className?: string; href?: string }) {
  const classes = cn("border-b border-outline-variant hover:bg-surface-bright/5 transition-colors", className);
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
    <td className={cn("p-3 data-mono text-on-surface", align === "right" && "text-right", align === "center" && "text-center", className)}>
      {children}
    </td>
  );
}