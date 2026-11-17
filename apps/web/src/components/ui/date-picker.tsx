'use client';

import { Popover } from '@base-ui/react/popover';
import { CalendarDays, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { forwardRef, useCallback, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Calendar } from './calendar';

/**
 * Date picker: a trigger styled like an input (works inside <Field>: id / aria-* reach the button) opening a Calendar
 * in a popover. Dates outside min/max are disabled. A hidden input carries `name` for forms.
 */
export function DatePicker({
  value, onChange, min, max, isDisabled, name, placeholder, disabled, rangeStart, onBlur, className, testId, id, label, clearable, yearNav,
  'aria-invalid': invalid, 'aria-describedby': describedBy, 'aria-required': required,
}: {
  value: string; onChange: (iso: string) => void; min?: string; max?: string; isDisabled?: (iso: string) => boolean; name?: string; placeholder?: ReactNode;
  disabled?: boolean; rangeStart?: string; onBlur?: () => void; className?: string; testId?: string; id?: string;
  /** Accessible name. Omit inside <Field>: the field's label (plus the chosen date) names the trigger. */
  label?: string;
  /** Shows a clear button when a date is set (optional dates). */
  clearable?: boolean;
  /** Month/year dropdowns in the calendar header. */
  yearNav?: boolean;
  'aria-invalid'?: boolean; 'aria-describedby'?: string; 'aria-required'?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const valueId = useId();
  const [fieldLabel, setFieldLabel] = useState<string | null>(null);
  const clearTextId = useId();
  const name_ = label ?? fieldLabel ?? t('chooseDate');
  // Visible: compact (fits narrow columns). The accessible name contains the visible text (WCAG 2.5.3);
  // the full date with weekday is offered as a tooltip.
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fmtLong = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shown = value ? fmt.format(new Date(`${value}T00:00:00Z`)) : null;
  const spoken = value ? fmtLong.format(new Date(`${value}T00:00:00Z`)) : null;
  return (
    <div className="relative w-full">
    <Popover.Root open={open} onOpenChange={(o) => {
      // Inside <Field> the label element is `${id}-label`: its text names the calendar grid.
      if (o && !label && id) setFieldLabel(document.getElementById(`${id}-label`)?.firstChild?.textContent ?? null);
      setOpen(o); if (!o) onBlur?.();
    }}>
      {/* aria-required isn't allowed on a button; the label's required marker and the error message carry it. */}
      <Popover.Trigger id={id} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} data-required={required || undefined}
        aria-label={label ? (shown ? `${label}: ${shown}` : label) : undefined}
        aria-labelledby={!label && id ? `${id}-label ${valueId}` : undefined} title={spoken ?? undefined} data-testid={testId ?? (name ? `date-${name}` : undefined)} data-value={value}
        className={cn('flex h-10 w-full items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-start text-sm text-fg transition-colors',
          'hover:border-fg-subtle focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus',
          'aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-subtle data-popup-open:border-primary', className)}>
        <CalendarDays className="size-4 shrink-0 text-fg-muted" aria-hidden />
        <span id={valueId} className={cn('tabular min-w-0 flex-1 truncate', !shown && 'text-fg-subtle')}>{shown ?? placeholder ?? (label ? null : t('chooseDate'))}</span>
        {/* Room for the clear button, which sits over the trigger (a button can't contain a button). */}
        {clearable && value && !disabled && <span className="w-5 shrink-0" aria-hidden />}
      </Popover.Trigger>
      {clearable && value && !disabled && (
        <button type="button" onClick={() => { onChange(''); onBlur?.(); }} aria-label={label ? `${t('clearDate')} — ${label}` : undefined}
          aria-labelledby={!label && id ? `${clearTextId} ${id}-label` : undefined}
          data-testid={`${testId ?? (name ? `date-${name}` : 'date')}-clear`}
          className="absolute end-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-fg-muted hover:bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-focus">
          <X className="size-3.5" aria-hidden /><span id={clearTextId} className="sr-only">{t('clearDate')}</span>
        </button>
      )}
      {name && <input type="hidden" name={name} value={value} />}
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="start" className="z-50">
          <Popover.Popup className="origin-[var(--transform-origin)] rounded-xl border border-border bg-surface-raised shadow-lg outline-none transition-[opacity,transform] duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0"
            data-testid={`${testId ?? (name ? `date-${name}` : 'date')}-popup`}>
            <Calendar value={value || undefined} min={min} max={max} isDisabled={isDisabled} label={name_} rangeStart={rangeStart} yearNav={yearNav}
              onSelect={(iso) => { onChange(iso); setOpen(false); }} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
    </div>
  );
}

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value' | 'defaultValue'> & {
  value?: string; defaultValue?: string;
  onChange?: (e: { target: HTMLInputElement; currentTarget: HTMLInputElement; type: 'change' }) => void;
  /** Clear button; defaults to on for optional fields. */
  clearable?: boolean;
  /** Month/year dropdowns; on by default (dashboard dates are often far from today). */
  yearNav?: boolean;
  'data-testid'?: string;
};

/**
 * Drop-in replacement for <Input type="date"> rendered as the design-system DatePicker (calendar popover, RTL week,
 * localised display, light/dark). A hidden input keeps the native contract: `name` posts with forms, react-hook-form
 * `register()` / reset() / focus-on-error keep working, and onChange gets an event whose target holds the ISO date.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { value, defaultValue, onChange, onBlur, name, min, max, disabled, id, className, required, clearable, yearNav = true, placeholder,
    'data-testid': testId, 'aria-invalid': invalid, 'aria-describedby': describedBy, 'aria-required': ariaRequired, 'aria-label': ariaLabel },
  ref,
) {
  const native = useRef<HTMLInputElement | null>(null);
  const controlled = value !== undefined;
  const [shown, setShown] = useState(defaultValue ?? '');
  // Runs after every render on purpose (reset()/setValue() don't re-render this component's props); it only sets
  // state when the DOM value differs, so it can't loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (!controlled && native.current && native.current.value !== shown) setShown(native.current.value); });
  const reactId = useId();
  const triggerId = id ?? `${reactId}-date`;
  const setRef = useCallback((el: HTMLInputElement | null) => {
    native.current = el;
    if (el) el.focus = () => document.getElementById(triggerId)?.focus();
    if (typeof ref === 'function') ref(el); else if (ref) ref.current = el;
  }, [ref, triggerId]);
  const emit = (iso: string) => {
    const el = native.current;
    if (!el) return;
    el.value = iso;
    if (!controlled) setShown(iso);
    onChange?.({ target: el, currentTarget: el, type: 'change' });
  };
  const required_ = Boolean(required || ariaRequired === true || ariaRequired === 'true');
  return (
    <>
      <input ref={setRef} type="hidden" name={name} {...(controlled ? { value } : { defaultValue })} />
      <DatePicker id={triggerId} value={controlled ? value : shown} onChange={emit} min={min ? String(min) : undefined} max={max ? String(max) : undefined} disabled={disabled}
        label={ariaLabel} className={cn('min-w-44', className)} testId={testId ?? (name ? `date-${name}` : undefined)} placeholder={placeholder}
        clearable={clearable ?? !required_} yearNav={yearNav} aria-invalid={invalid === true || invalid === 'true'} aria-describedby={describedBy} aria-required={required_}
        onBlur={() => onBlur?.({ target: native.current, currentTarget: native.current, type: 'blur' } as never)} />
    </>
  );
});
