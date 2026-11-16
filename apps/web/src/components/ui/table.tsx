import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    // Focusable so keyboard users can scroll wide tables sideways (WCAG 2.1.1).
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-surface" tabIndex={0} role="region" aria-label={props['aria-label']}>
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}

export const THead = (p: HTMLAttributes<HTMLTableSectionElement>) => <thead className="sticky top-0 bg-subtle" {...p} />;
export const TBody = (p: HTMLAttributes<HTMLTableSectionElement>) => <tbody className="divide-y divide-border" {...p} />;
export const Tr = ({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) => <tr className={cn('h-11 transition-colors hover:bg-subtle/60', className)} {...p} />;

export function Th({ className, numeric, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <th scope="col" className={cn('px-4 py-2.5 text-xs font-semibold tracking-wide text-fg-muted uppercase', numeric ? 'text-end' : 'text-start', className)} {...props} />;
}

export function Td({ className, numeric, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn('px-4 py-2.5 text-fg', numeric && 'tabular text-end', className)} {...props} />;
}
