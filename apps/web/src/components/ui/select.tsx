'use client';

import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SelectOption { value: string; label: string; hint?: string; disabled?: boolean }

/**
 * Styled select (shadcn-style API on Base UI — the project's primitive layer): keyboard navigation, typeahead,
 * focus management, RTL-aware positioning, and a hidden input (`name`) for forms. Works inside <Field>: the id and
 * aria-* props reach the trigger.
 */
export function SelectField({
  value, onValueChange, options, name, placeholder, disabled, className, testId, onBlur, id,
  'aria-invalid': invalid, 'aria-describedby': describedBy, 'aria-required': required, 'aria-label': ariaLabel,
}: {
  value: string; onValueChange: (v: string) => void; options: SelectOption[]; name?: string; placeholder?: ReactNode; disabled?: boolean;
  className?: string; testId?: string; onBlur?: () => void; id?: string;
  'aria-invalid'?: boolean; 'aria-describedby'?: string; 'aria-required'?: boolean; 'aria-label'?: string;
}) {
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return (
    <BaseSelect.Root value={value} onValueChange={(v) => onValueChange(String(v ?? ''))} name={name} disabled={disabled} items={items}
      onOpenChange={(open) => { if (!open) onBlur?.(); }}>
      <BaseSelect.Trigger id={id} aria-invalid={invalid || undefined} aria-describedby={describedBy} aria-required={required || undefined} aria-label={ariaLabel}
        data-testid={testId ?? (name ? `select-${name}` : undefined)} data-value={value}
        className={cn('flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-3 text-start text-sm text-fg transition-colors',
          'hover:border-fg-subtle focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus',
          'aria-invalid:border-danger data-disabled:cursor-not-allowed data-disabled:bg-subtle data-disabled:text-fg-muted data-popup-open:border-primary', className)}>
        <BaseSelect.Value className="min-w-0 flex-1 truncate data-placeholder:text-fg-subtle" placeholder={placeholder} />
        <BaseSelect.Icon className="shrink-0 text-fg-muted transition-transform data-popup-open:rotate-180"><ChevronDown className="size-4" aria-hidden /></BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-50 outline-none">
          <BaseSelect.Popup className={cn('max-h-[min(20rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 text-sm text-fg shadow-lg outline-none',
            'origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0')}
            data-testid={testId ?? (name ? `select-${name}` : undefined) ? `${testId ?? `select-${name}`}-list` : undefined}>
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item key={o.value} value={o.value} disabled={o.disabled} data-value={o.value}
                  className="grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-md px-2 py-2 outline-none select-none data-disabled:opacity-50 data-highlighted:bg-primary-soft data-highlighted:text-on-primary-soft">
                  <BaseSelect.ItemIndicator className="col-start-1"><Check className="size-4 text-primary" aria-hidden /></BaseSelect.ItemIndicator>
                  <span className="col-start-2 flex min-w-0 flex-col">
                    <BaseSelect.ItemText className="truncate">{o.label}</BaseSelect.ItemText>
                    {o.hint && <span className="truncate text-xs text-fg-muted">{o.hint}</span>}
                  </span>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
