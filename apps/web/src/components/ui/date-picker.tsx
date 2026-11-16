'use client';

import { Popover } from '@base-ui/react/popover';
import { CalendarDays } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Calendar } from './calendar';

/**
 * Date picker: a trigger styled like an input (works inside <Field>: id / aria-* reach the button) opening a Calendar
 * in a popover. Dates outside min/max are disabled. A hidden input carries `name` for forms.
 */
export function DatePicker({
  value, onChange, min, max, isDisabled, name, placeholder, disabled, rangeStart, onBlur, className, testId, id, label,
  'aria-invalid': invalid, 'aria-describedby': describedBy, 'aria-required': required,
}: {
  value: string; onChange: (iso: string) => void; min?: string; max?: string; isDisabled?: (iso: string) => boolean; name?: string; placeholder?: ReactNode;
  disabled?: boolean; rangeStart?: string; onBlur?: () => void; className?: string; testId?: string; id?: string; label: string;
  'aria-invalid'?: boolean; 'aria-describedby'?: string; 'aria-required'?: boolean;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  // Visible: compact (fits narrow columns). The accessible name contains the visible text (WCAG 2.5.3);
  // the full date with weekday is offered as a tooltip.
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fmtLong = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shown = value ? fmt.format(new Date(`${value}T00:00:00Z`)) : null;
  const spoken = value ? fmtLong.format(new Date(`${value}T00:00:00Z`)) : null;
  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) onBlur?.(); }}>
      {/* aria-required isn't allowed on a button; the label's required marker and the error message carry it. */}
      <Popover.Trigger id={id} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} data-required={required || undefined}
        aria-label={shown ? `${label}: ${shown}` : label} title={spoken ?? undefined} data-testid={testId ?? (name ? `date-${name}` : undefined)} data-value={value}
        className={cn('flex h-10 w-full items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-start text-sm text-fg transition-colors',
          'hover:border-fg-subtle focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus',
          'aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-subtle data-popup-open:border-primary', className)}>
        <CalendarDays className="size-4 shrink-0 text-fg-muted" aria-hidden />
        <span className={cn('tabular min-w-0 flex-1 truncate', !shown && 'text-fg-subtle')}>{shown ?? placeholder}</span>
      </Popover.Trigger>
      {name && <input type="hidden" name={name} value={value} />}
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="start" className="z-50">
          <Popover.Popup className="origin-[var(--transform-origin)] rounded-xl border border-border bg-surface-raised shadow-lg outline-none transition-[opacity,transform] duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0"
            data-testid={`${testId ?? (name ? `date-${name}` : 'date')}-popup`}>
            <Calendar value={value || undefined} min={min} max={max} isDisabled={isDisabled} label={label} rangeStart={rangeStart}
              onSelect={(iso) => { onChange(iso); setOpen(false); }} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
