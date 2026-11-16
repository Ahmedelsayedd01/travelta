'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

/**
 * One-time code input: N single-digit boxes, auto-advance, backspace to the previous box, paste of the whole code.
 * Always laid out left-to-right (codes are read as numbers, also in Arabic). Value is the joined digits.
 */
export function OtpInput({ value, onChange, length = 6, label, invalid, describedBy, autoFocus, testId = 'otp-input' }: {
  value: string; onChange: (v: string) => void; length?: number; label: string; invalid?: boolean; describedBy?: string; autoFocus?: boolean; testId?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const setAt = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join('').replace(/\s/g, '').slice(0, length));
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { refs.current[i - 1]?.focus(); setAt(i - 1, ''); e.preventDefault(); }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const code = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!code) return;
    e.preventDefault();
    onChange(code);
    refs.current[Math.min(code.length, length - 1)]?.focus();
  };
  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex justify-between gap-2" dir="ltr" data-testid={testId}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={1}
          aria-label={`${label} ${i + 1}/${length}`} aria-invalid={invalid || undefined} autoFocus={autoFocus && i === 0}
          className={cn('h-12 w-full min-w-0 rounded-md border bg-surface text-center text-lg font-semibold tabular-nums text-fg focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-focus sm:h-14 sm:text-xl', invalid ? 'border-danger' : 'border-border-strong')}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); if (v.length > 1) { onChange((value.slice(0, i) + v).slice(0, length)); refs.current[Math.min(i + v.length, length - 1)]?.focus(); return; } setAt(i, v); if (v && i < length - 1) refs.current[i + 1]?.focus(); }}
          onKeyDown={(e) => onKey(i, e)} onPaste={onPaste} onFocus={(e) => e.target.select()} />
      ))}
    </div>
  );
}

/** Small numbered progress for multi-step flows (email → code → password → done). */
export function Steps({ steps, current, label }: { steps: string[]; current: number; label: string }) {
  return (
    <ol aria-label={label} className="mb-6 flex items-center gap-2 text-xs font-medium" data-testid="auth-steps">
      {steps.map((s, i) => (
        <li key={s} aria-current={i === current ? 'step' : undefined} className={cn('flex flex-1 flex-col gap-1.5', i <= current ? 'text-primary' : 'text-fg-muted')}>
          <span className={cn('h-1.5 rounded-full', i <= current ? 'bg-primary' : 'bg-border')} aria-hidden />
          <span className="truncate">{s}</span>
        </li>
      ))}
    </ol>
  );
}
