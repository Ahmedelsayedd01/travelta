import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-semibold whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-neutral-bg text-neutral',
      primary: 'bg-primary-soft text-on-primary-soft',
      success: 'bg-success-bg text-success',
      warning: 'bg-warning-bg text-warning',
      danger: 'bg-danger-bg text-danger',
      info: 'bg-info-bg text-info',
      highlight: 'bg-highlight text-on-highlight',
      accent: 'bg-accent text-on-accent',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Show a leading dot so status is never conveyed by colour alone (paired with text). */
  dot?: boolean;
}

export function Badge({ className, tone, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
