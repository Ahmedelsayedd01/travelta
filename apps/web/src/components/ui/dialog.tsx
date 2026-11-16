'use client';

import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';

const backdrop = 'fixed inset-0 bg-overlay transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0';
const popup =
  'fixed top-1/2 left-1/2 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-surface-raised p-6 text-fg shadow-lg transition-[scale,opacity] duration-200 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-3xl' };

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md' }: DialogProps) {
  const t = useTranslations('common');
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={backdrop} />
        <BaseDialog.Viewport>
          <BaseDialog.Popup className={cn(popup, widths[size])}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <BaseDialog.Title className="text-lg font-semibold">{title}</BaseDialog.Title>
                {description && <BaseDialog.Description className="mt-1 text-sm text-fg-muted">{description}</BaseDialog.Description>}
              </div>
              <BaseDialog.Close className="rounded-md p-1 text-fg-muted hover:bg-subtle hover:text-fg" aria-label={t('close')}>
                <X className="size-5" aria-hidden />
              </BaseDialog.Close>
            </div>
            {children}
            {footer && <div className="flex flex-wrap justify-end gap-2 pt-2">{footer}</div>}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

/** Required for destructive actions (DESIGN_SYSTEM §6): restates the object and uses a danger button. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive = true, loading, onConfirm }: ConfirmDialogProps) {
  const t = useTranslations('common');
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdrop} />
        <AlertDialog.Viewport>
          <AlertDialog.Popup className={cn(popup, widths.sm)}>
            <div>
              <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
              {description && <AlertDialog.Description className="mt-1 text-sm text-fg-muted">{description}</AlertDialog.Description>}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <AlertDialog.Close render={<Button variant="outline" />}>{t('cancel')}</AlertDialog.Close>
              <Button variant={destructive ? 'danger' : 'primary'} loading={loading} onClick={() => void onConfirm()}>
                {confirmLabel}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
