'use client';

import { Children, forwardRef, isValidElement, useCallback, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { SelectField, type SelectOption } from './select';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-muted aria-invalid:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, 'h-10', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...props },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'py-2', className)} {...props} />;
});

/** Text of an <option>'s children (strings, numbers, nested fragments). */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/** Flattens <option> children (arrays, fragments, conditionals) into design-system select options. */
function optionsOf(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>(child)) return;
    if (child.type === 'option') {
      const label = textOf(child.props.children);
      out.push({ value: String(child.props.value ?? label), label, disabled: child.props.disabled });
    } else out.push(...optionsOf(child.props.children));
  });
  return out;
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'defaultValue'> & {
  value?: string | number; defaultValue?: string | number;
  onChange?: (e: { target: HTMLSelectElement; currentTarget: HTMLSelectElement; type: 'change' }) => void;
  'data-testid'?: string;
};

/**
 * Drop-in replacement for a native <select> with <option> children, rendered as the design-system SelectField
 * (styled popup, keyboard and typeahead, RTL, light/dark). A hidden native <select> keeps the native contract:
 * `name` posts with forms, react-hook-form `register()` refs, reset() and focus-on-error keep working, and
 * onChange receives an event whose target is that select (`e.target.value` / `e.target.name`).
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, value, defaultValue, onChange, onBlur, name, disabled, id, 'data-testid': testId, 'aria-label': ariaLabel,
    'aria-invalid': invalid, 'aria-describedby': describedBy, 'aria-required': required, required: nativeRequired, ...rest },
  ref,
) {
  const options = optionsOf(children);
  const native = useRef<HTMLSelectElement | null>(null);
  const trigger = useRef<HTMLDivElement>(null);
  const controlled = value !== undefined;
  const [shown, setShown] = useState(() => String(defaultValue ?? options[0]?.value ?? ''));
  // Uncontrolled (register()/reset()) values are written straight to the DOM: mirror them after every render.
  // Runs after every render on purpose (reset()/setValue() don't re-render this component's props); it only sets
  // state when the DOM value differs, so it can't loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (!controlled && native.current && native.current.value !== shown) setShown(native.current.value); });
  const setRef = useCallback((el: HTMLSelectElement | null) => {
    native.current = el;
    // Focus-on-error (react-hook-form calls ref.focus()) lands on the visible trigger.
    if (el) el.focus = () => (document.getElementById(el.dataset.trigger ?? '') ?? trigger.current)?.focus();
    if (typeof ref === 'function') ref(el); else if (ref) ref.current = el;
  }, [ref]);
  const reactId = useId();
  const triggerId = id ?? `${reactId}-select`;
  const emit = (v: string) => {
    const el = native.current;
    if (!el) return;
    el.value = v;
    if (!controlled) setShown(v);
    onChange?.({ target: el, currentTarget: el, type: 'change' });
  };
  return (
    <>
      <select ref={setRef} hidden aria-hidden tabIndex={-1} name={name} disabled={disabled} data-trigger={triggerId}
        {...(controlled ? { value: String(value) } : { defaultValue: defaultValue === undefined ? undefined : String(defaultValue) })}
        onChange={(e) => { if (!controlled) setShown(e.target.value); onChange?.({ target: e.target, currentTarget: e.target, type: 'change' }); }} {...rest}>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      <div ref={trigger} className="contents">
        <SelectField id={triggerId} value={controlled ? String(value) : shown} onValueChange={emit} options={options} disabled={disabled}
          testId={testId ?? (name ? `select-${name}` : undefined)} className={className} aria-label={ariaLabel}
          aria-invalid={invalid === true || invalid === 'true'} aria-describedby={describedBy} aria-required={required === true || required === 'true' || nativeRequired}
          onBlur={() => onBlur?.({ target: native.current, currentTarget: native.current, type: 'blur' } as never)} />
      </div>
    </>
  );
});
