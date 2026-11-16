'use client';

import type { ServiceType } from '@travelta/contracts';
import type { BoardItem } from '@travelta/schemas';
import { Ban, CheckCircle2, FileCheck2, RotateCw, UserX, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useApi } from '@/components/api-provider';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { useAction } from '@/lib/mutations';

type Action = BoardItem['actions'][number];

/** Extra actions contributed by other modules (cancellation W7, credit approval WAL-4). */
export type ActionRenderers = Partial<Record<Action, (target: ActionTarget) => ReactNode>>;
export interface ActionTarget { bookingId: string; itemId: string; title: string; serviceType: ServiceType }

const INVALIDATE = [['bookings'], ['cart'], ['wallet'], ['payments'], ['invoices'], ['accounting']] as const;

export function ItemActions({ target, actions, size = 'sm', extra }: { target: ActionTarget; actions: readonly Action[]; size?: 'sm' | 'md'; extra?: ActionRenderers }) {
  const t = useTranslations('bookings');
  const api = useApi();
  const [dialog, setDialog] = useState<'confirm' | 'reject' | null>(null);
  const [ref, setRef] = useState('');
  const [ops, setOps] = useState({ pnr: '', ticketNo: '', driver: '' });
  const [reason, setReason] = useState('');
  const close = () => { setDialog(null); setRef(''); setReason(''); setOps({ pnr: '', ticketNo: '', driver: '' }); };
  const ids = { bookingId: target.bookingId, itemId: target.itemId };
  const confirm = useAction(() => api.call('bookings.confirmItem', {
    ...ids, supplierRef: ref, details: Object.fromEntries(Object.entries(ops).filter(([, v]) => v.trim())),
  }), { success: t('confirmed'), invalidate: INVALIDATE, onSuccess: close });
  const reject = useAction(() => api.call('bookings.rejectItem', { ...ids, reason }), { success: t('rejected'), invalidate: INVALIDATE, onSuccess: close });
  const voucher = useAction(() => api.call('bookings.voucherItem', ids), { success: t('vouchered'), invalidate: INVALIDATE });
  const noShow = useAction(() => api.call('bookings.markNoShow', ids), { success: t('noShowDone'), invalidate: INVALIDATE });
  const retry = useAction(() => api.call('bookings.retrySupplier', ids), { success: t('retried'), invalidate: INVALIDATE });

  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="item-actions">
      {actions.includes('confirm') && <Button size={size} onClick={() => setDialog('confirm')} data-action="confirm"><CheckCircle2 aria-hidden />{t('confirm')}</Button>}
      {actions.includes('reject') && <Button size={size} variant="outline" onClick={() => setDialog('reject')} data-action="reject"><XCircle aria-hidden />{t('reject')}</Button>}
      {actions.includes('voucher') && <Button size={size} onClick={() => voucher.mutate()} loading={voucher.isPending} data-action="voucher"><FileCheck2 aria-hidden />{t('voucher')}</Button>}
      {actions.includes('retry') && <Button size={size} variant="outline" onClick={() => retry.mutate()} loading={retry.isPending} data-action="retry"><RotateCw aria-hidden />{t('retry')}</Button>}
      {actions.includes('no_show') && <Button size={size} variant="ghost" onClick={() => noShow.mutate()} loading={noShow.isPending} data-action="no_show"><UserX aria-hidden />{t('noShow')}</Button>}
      {(['approve_credit', 'cancel'] as const).map((a) => actions.includes(a) && extra?.[a] ? <span key={a} className="contents">{extra[a]!(target)}</span> : null)}

      <Dialog open={dialog === 'confirm'} onOpenChange={(o) => !o && close()} title={t('confirmTitle', { title: target.title })} description={t('confirmBody')}
        footer={<><Button variant="outline" onClick={close}>{t('cancel')}</Button><Button onClick={() => confirm.mutate()} loading={confirm.isPending} disabled={ref.trim().length < 2} data-testid="confirm-submit">{t('confirm')}</Button></>}>
        <div className="flex flex-col gap-3">
          <Field label={t('supplierRef')} required><Input name="supplierRef" dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} autoFocus /></Field>
          {target.serviceType === 'flight' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('pnr')} optional><Input dir="ltr" value={ops.pnr} onChange={(e) => setOps({ ...ops, pnr: e.target.value.toUpperCase() })} /></Field>
              <Field label={t('ticketNo')} optional><Input dir="ltr" value={ops.ticketNo} onChange={(e) => setOps({ ...ops, ticketNo: e.target.value })} /></Field>
            </div>
          )}
          {target.serviceType === 'transfer' && <Field label={t('driver')} optional><Input value={ops.driver} onChange={(e) => setOps({ ...ops, driver: e.target.value })} /></Field>}
        </div>
      </Dialog>
      <Dialog open={dialog === 'reject'} onOpenChange={(o) => !o && close()} title={t('rejectTitle', { title: target.title })} description={t('rejectBody')}
        footer={<><Button variant="outline" onClick={close}>{t('cancel')}</Button><Button variant="danger" onClick={() => reject.mutate()} loading={reject.isPending} disabled={reason.trim().length < 3} data-testid="reject-submit"><Ban aria-hidden />{t('reject')}</Button></>}>
        <Field label={t('reason')} required><Textarea name="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Dialog>
    </div>
  );
}
