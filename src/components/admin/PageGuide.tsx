import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageGuideProps = {
  what: ReactNode;
  whatFor?: ReactNode;
  nextStep?: { href: string; label: string };
  tone?: "info" | "muted";
  className?: string;
};

export function PageGuide({ what, whatFor, nextStep, tone = "info", className }: PageGuideProps) {
  return (
    <section
      className={cn(
        "flex items-start gap-3 rounded-md border px-4 py-3 mb-6",
        tone === "info"
          ? "border-primary/30 bg-primary/5"
          : "border-outline-variant bg-surface-container-low",
        className,
      )}
      aria-label="Guía de la pantalla"
    >
      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm text-on-surface leading-snug">{what}</p>
        {whatFor && <p className="text-xs text-on-surface-variant leading-snug">{whatFor}</p>}
      </div>
      {nextStep && (
        <Link
          href={nextStep.href}
          className="hidden sm:inline-flex items-center gap-1.5 shrink-0 label-caps text-primary hover:underline self-center"
        >
          {nextStep.label}
          <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </section>
  );
}
