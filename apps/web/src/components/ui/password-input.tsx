'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Input } from './input';

/** Password field with a show/hide toggle. Works inside <Field>: id, aria-* and react-hook-form props reach the <input>. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function PasswordInput({ className, ...props }, ref) {
  const t = useTranslations('auth');
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={shown ? 'text' : 'password'} dir="ltr" className={cn('pe-11', className)} {...props} />
      <button type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown} aria-label={shown ? t('hidePassword') : t('showPassword')}
        className="absolute inset-y-0 end-0 flex w-10 items-center justify-center rounded-e-md text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
        data-testid="toggle-password">
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
});
