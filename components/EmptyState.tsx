import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Optional call to action, e.g. the New note button (Phase 4). */
  action?: ReactNode;
}

/** Illustration-free empty state card (SPEC Block E). Presentational only. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-card border border-border bg-surface px-6 py-16 text-center shadow-card">
      <p className="text-lg font-semibold tracking-tight">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-7 flex justify-center">{action}</div> : null}
    </div>
  );
}
