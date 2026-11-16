'use client';

import type { ComponentProps, ReactNode } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { Field } from '@/components/ui/field';
import { SelectField, type SelectOption } from '@/components/ui/select';

/** Label + error wiring for any control (re-export of the design-system Field). */
export { Field as FormField };

type Common = { label: string; error?: string; help?: ReactNode; required?: boolean; optional?: boolean; className?: string };

/** Field + SelectField: label, required marker, help and error message wired to the trigger. */
export function FormSelect({ label, error, help, required, optional, className, ...select }: Common & { value: string; onValueChange: (v: string) => void; options: SelectOption[]; name?: string; placeholder?: ReactNode; disabled?: boolean; onBlur?: () => void; testId?: string }) {
  return (
    <Field label={label} error={error} help={help} required={required} optional={optional} className={className}>
      <SelectField {...select} />
    </Field>
  );
}

/** Field + DatePicker. */
export function FormDatePicker({ label, error, help, required, optional, className, ...picker }: Common & Omit<ComponentProps<typeof DatePicker>, 'label' | 'id'>) {
  return (
    <Field label={label} error={error} help={help} required={required} optional={optional} className={className}>
      <DatePicker label={label} {...picker} />
    </Field>
  );
}
