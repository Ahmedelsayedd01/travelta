import type { ReactNode } from 'react';

/** Title row used by every portal page: heading, short description, primary actions. */
export function PageHeader({ title, description, actions, testId }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; testId?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-fg" data-testid={testId ?? 'page-title'}>{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
