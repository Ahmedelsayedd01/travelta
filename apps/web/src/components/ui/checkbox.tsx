'use client';

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked, onCheckedChange, label, disabled, className }: ToggleProps) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-fg', disabled && 'cursor-not-allowed opacity-60', className)}>
      <BaseCheckbox.Root
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value)}
        disabled={disabled}
        className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface transition-colors data-checked:border-primary data-checked:bg-primary"
      >
        <BaseCheckbox.Indicator className="text-on-primary data-unchecked:hidden">
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      {label}
    </label>
  );
}

export function Switch({ checked, onCheckedChange, label, disabled, className }: ToggleProps) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-3 text-sm text-fg', disabled && 'cursor-not-allowed opacity-60', className)}>
      <BaseSwitch.Root
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value)}
        disabled={disabled}
        className="relative flex h-6 w-11 shrink-0 items-center rounded-full bg-border-strong p-0.5 transition-colors data-checked:bg-primary"
      >
        <BaseSwitch.Thumb className="size-5 rounded-full bg-surface shadow-sm transition-transform duration-150 data-checked:translate-x-5 rtl:data-checked:-translate-x-5" />
      </BaseSwitch.Root>
      {label}
    </label>
  );
}
