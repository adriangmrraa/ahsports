import type { ReactNode } from "react";
import { EmptyState as BaseEmptyState } from "@/components/ui/Card";

/**
 * Empty list that teaches: what the thing is, what it is for, and the one
 * primary action to create the first one.
 */
export function AdminEmptyState({
  title,
  what,
  whatFor,
  action,
}: {
  title: ReactNode;
  what: ReactNode;
  whatFor?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <BaseEmptyState
      title={title}
      description={
        <>
          {what}
          {whatFor && <span className="block mt-1 text-on-surface-variant">{whatFor}</span>}
        </>
      }
      action={action}
    />
  );
}
