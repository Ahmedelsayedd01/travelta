'use client';

import { useTranslations } from 'next-intl';
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

interface FieldProps {
  label: ReactNode;
  /** Validation message key from @travelta/schemas (e.g. `validation.required`) or plain text. */
  error?: string;
  help?: ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}

/** Label + control + help/error wiring (aria-describedby, aria-invalid) for every form control. */
export function Field({ label, error, help, required, optional, className, children }: FieldProps) {
  const t = useTranslations();
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const message = error ? (t.has(error as never) ? t(error as never) : error) : null;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} id={`${id}-label`} className="text-sm font-medium text-fg">
        {label}
        {required && <span className="ms-0.5 text-danger" aria-hidden>*</span>}
        {optional && <span className="ms-1 text-xs font-normal text-fg-muted">({t('common.optional')})</span>}
      </label>
      {isValidElement(children)
        ? cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, 'aria-required': required || undefined })
        : children}
      {help && !message && (
        <p id={helpId} className="text-xs text-fg-muted">
          {help}
        </p>
      )}
      {message && (
        <p id={errorId} role="alert" className="flex items-center gap-1 text-xs font-medium text-danger">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {message}
        </p>
      )}
    </div>
  );
}
