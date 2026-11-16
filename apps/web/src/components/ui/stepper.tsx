import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Horizontal step indicator for wizards (onboarding, manual booking, checkout). */
export function Stepper({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  return (
    <ol className={cn('flex items-center gap-2', className)} aria-label={`${current + 1} / ${steps.length}`}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              done ? 'bg-primary text-on-primary' : active ? 'bg-primary-soft text-on-primary-soft ring-2 ring-primary' : 'bg-subtle text-fg-muted',
            )}>
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn('truncate text-sm', active ? 'font-semibold text-fg' : 'text-fg-muted')}>{label}</span>
            {i < steps.length - 1 && <span className={cn('h-px min-w-4 flex-1', done ? 'bg-primary' : 'bg-border')} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
