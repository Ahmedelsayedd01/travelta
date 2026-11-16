'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

/** Side drawer for details and forms; slides from the inline end (mirrors in RTL). */
export function Sheet({ open, onOpenChange, title, description, children, footer, size = 'md' }: SheetProps) {
  const t = useTranslations('common');
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Popup
          className={cn(
            'fixed inset-y-0 end-0 z-50 flex w-full flex-col border-s border-border bg-surface-raised text-fg shadow-lg transition-transform duration-250 ease-out',
            'data-ending-style:translate-x-full data-starting-style:translate-x-full rtl:data-ending-style:-translate-x-full rtl:data-starting-style:-translate-x-full',
            size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div className="min-w-0">
              <BaseDialog.Title className="text-lg font-semibold">{title}</BaseDialog.Title>
              {description && <BaseDialog.Description className="mt-0.5 text-sm text-fg-muted">{description}</BaseDialog.Description>}
            </div>
            <BaseDialog.Close className="rounded-md p-1 text-fg-muted hover:bg-subtle hover:text-fg" aria-label={t('close')}>
              <X className="size-5" aria-hidden />
            </BaseDialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
