import type { HTMLAttributes, ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-border bg-surface shadow-sm', className)} {...props} />;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-fg">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Percentage change vs previous period. */
  delta?: number;
  deltaLabel?: ReactNode;
  icon?: ReactNode;
}

export function StatCard({ label, value, delta, deltaLabel, icon }: StatCardProps) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-fg-muted">{label}</span>
        {icon && <span className="flex size-9 items-center justify-center rounded-md bg-primary-soft text-on-primary-soft [&_svg]:size-4">{icon}</span>}
      </div>
      <span className="tabular text-2xl font-semibold text-fg">{value}</span>
      {delta !== undefined && (
        <span className={cn('inline-flex items-center gap-1 text-xs font-medium', up ? 'text-success' : 'text-danger')}>
          {up ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
          <span className="tabular">{`${up ? '+' : ''}${delta.toFixed(1)}%`}</span>
          {deltaLabel && <span className="text-fg-muted">{deltaLabel}</span>}
        </span>
      )}
    </Card>
  );
}
