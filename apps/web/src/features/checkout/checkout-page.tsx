'use client';

import { useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@travelta/api-client';
import type { BookingDto, CheckoutPayment, ItemDetails, RecheckOutput, Traveller } from '@travelta/schemas';
import { ArrowLeft, ArrowRight, CheckCircle2, CreditCard, RefreshCw, ShoppingCart, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useApi } from '@/components/api-provider';
import { EmptyState } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Stepper } from '@/components/ui/stepper';
import { CartLine, CartTotals, useCart } from '@/features/cart/cart-page';
import { useDemoToday } from '@/features/demo/hooks';
import { priceOf } from '@/features/search/format';
import { Link, useRouter } from '@/i18n/navigation';
import { useErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { CustomerStep, type CustomerChoice } from './customer-step';
import { PaymentPlanEditor, planInstallments, type PlanDraft } from './payment-step';
import { blankTravellers, TravellerFields } from './traveller-fields';

type Step = 'review' | 'customer' | 'travellers' | 'payment';
const newKey = () => `chk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** W2 step 6–7 / W3 step 4: recheck → customer → travellers → payment → idempotent submit. */
export function CheckoutPage({ portalRoot = '/agency', storefront }: { portalRoot?: string; storefront?: string }) {
  const t = useTranslations('checkout');
  const tc = useTranslations('cart');
  const locale = useLocale();
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const cart = useCart(storefront);
  const staff = cart.data ? cart.data.audience !== 'customer' : true;
  const steps: Step[] = staff ? ['review', 'customer', 'travellers', 'payment'] : ['review', 'travellers', 'payment'];
  const [step, setStep] = useState<Step>('review');
  const [recheck, setRecheck] = useState<RecheckOutput | null>(null);
  const [accepted, setAccepted] = useState(false);
  // CRM-2: a won request opens checkout pre-filled with its customer and links the booking back to the request.
  const params = useSearchParams();
  const prefill = { customerId: params.get('customer'), requestId: params.get('request') ?? undefined };
  const [customer, setCustomer] = useState<CustomerChoice>({ mode: 'existing', customerId: prefill.customerId });
  const [travellers, setTravellers] = useState<Record<string, Traveller[]>>({});
  const [details, setDetails] = useState<Record<string, ItemDetails>>({});
  const [plan, setPlan] = useState<PlanDraft>({ type: 'full', installments: [] });
  const [card, setCard] = useState({ method: 'card' as 'card' | 'pay_later', number: '', expiry: '', cvc: '', holder: '', threeDsCode: '' });
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<BookingDto | null>(null);
  const idempotencyKey = useRef(newKey());
  const demoToday = useDemoToday();

  const runRecheck = useMutation({
    mutationFn: () => api.call('checkout.recheck', { storefront }),
    onSuccess: (r) => {
      setRecheck(r);
      setAccepted(!r.changes.some((c) => c.status === 'price_changed'));
      void qc.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runRecheck.mutate();
  }, [runRecheck]);

  const items = recheck?.cart.items ?? [];

  const remove = useMutation({
    mutationFn: (itemId: string) => api.call('cart.removeItem', { itemId, storefront }),
    onSuccess: () => runRecheck.mutate(),
  });

  const payment = (): CheckoutPayment => staff
    ? { method: 'plan', type: plan.type, installments: plan.type === 'partial' ? planInstallments(plan) : [] }
    : card.method === 'pay_later' ? { method: 'pay_later' }
      : { method: 'card', card: { number: card.number, expiry: card.expiry, cvc: card.cvc, holder: card.holder, threeDsCode: card.threeDsCode || undefined } };

  const submit = useMutation({
    mutationFn: () => api.call('checkout.submit', {
      idempotencyKey: idempotencyKey.current, storefront, requestId: prefill.requestId,
      customerId: customer.mode === 'existing' ? customer.customerId : null,
      newCustomer: customer.mode === 'new' ? customer.customer : null,
      items: items.map((i) => ({ itemId: i.id, travellers: travellers[i.id] ?? blankTravellers(i), details: details[i.id] ?? {}, acceptedPriceMinor: i.priceMinor })),
      payment: payment(), notes,
    }),
    onSuccess: (booking) => {
      setDone(booking);
      void qc.invalidateQueries();
    },
    onError: (e) => {
      if (e instanceof ApiClientError && (e.code === 'PRICE_CHANGED' || e.code === 'SOLD_OUT')) {
        toast.error(e.code === 'PRICE_CHANGED' ? t('pricesChangedError') : t('soldOutError'));
        idempotencyKey.current = newKey();
        setStep('review');
        runRecheck.mutate();
        return;
      }
      if (e instanceof ApiClientError && Object.keys(e.fieldErrors()).length > 0) {
        const fields = e.fieldErrors();
        setErrors(fields);
        const first = Object.keys(fields)[0]!;
        setStep(first.startsWith('items') ? 'travellers' : first.startsWith('payment') ? 'payment' : first.startsWith('customer') || first.startsWith('newCustomer') ? 'customer' : 'review');
        toast.error(t('fieldsMissing'));
        return;
      }
      toast.error(errorMessage(e));
    },
  });

  if (done) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-12 text-center" data-testid="checkout-done">
        <span className="flex size-16 items-center justify-center rounded-full bg-success-bg text-success"><CheckCircle2 className="size-8" aria-hidden /></span>
        <h1 className="text-2xl font-bold text-fg">{t('doneTitle', { ref: done.ref })}</h1>
        <p className="text-fg-muted">{t('doneBody')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => router.push(`${portalRoot}/bookings/${done.id}`)} data-testid="view-booking">{t('viewBooking')}</Button>
          <Button variant="outline" onClick={() => router.push(portalRoot === '/account' ? '/search' : `${portalRoot}/search`)}>{t('newSearch')}</Button>
        </div>
      </div>
    );
  }

  if (cart.data && cart.data.items.length === 0 && !runRecheck.isPending) {
    return (<><PageHeader title={t('title')} /><EmptyState icon={<ShoppingCart aria-hidden />} title={tc('empty')} body={tc('emptyBody')} action={<Link href={`${portalRoot}/search`} className="font-medium text-primary hover:underline">{tc('searchNow')}</Link>} /></>);
  }

  const changed = recheck?.changes.filter((c) => c.status === 'price_changed') ?? [];
  const unavailable = recheck?.changes.filter((c) => c.status === 'unavailable') ?? [];
  const canLeaveReview = recheck !== null && unavailable.length === 0 && (changed.length === 0 || accepted);
  const index = steps.indexOf(step);
  const next = () => { setErrors({}); setStep(steps[index + 1]!); };
  const labels: Record<Step, string> = { review: t('stepReview'), customer: t('stepCustomer'), travellers: t('stepTravellers'), payment: t('stepPayment') };
  const currency = recheck?.cart.currency ?? 'EGP';
  const today = demoToday;
  const serviceStart = items.map((i) => i.from).sort()[0] ?? today;

  return (
    <>
      <PageHeader title={t('title')} />
      <Stepper steps={steps.map((s) => labels[s])} current={index} className="mb-6" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4" data-testid={`step-${step}`}>
          {step === 'review' && (
            <Card>
              <CardHeader title={t('stepReview')} actions={<Button variant="ghost" size="sm" onClick={() => runRecheck.mutate()} loading={runRecheck.isPending}><RefreshCw aria-hidden />{t('stepReview')}</Button>} />
              <CardBody className="flex flex-col gap-3">
                {!recheck ? (<><p className="text-sm text-fg-muted" role="status">{t('rechecking')}</p><Skeleton className="h-32 w-full" /></>) : (
                  <>
                    {changed.length === 0 && unavailable.length === 0 && <p className="flex items-center gap-2 text-sm text-success" role="status"><CheckCircle2 className="size-4" aria-hidden />{t('allGood')}</p>}
                    {recheck.cart.items.map((item) => {
                      const c = recheck.changes.find((x) => x.itemId === item.id);
                      return (
                        <CartLine key={item.id} item={item} staff={staff}
                          highlight={c?.status === 'price_changed' ? (
                            <p className="tabular text-sm font-medium text-warning" data-testid="price-change">{t('priceChanged')}: {t('oldNew', { old: priceOf(c.oldPriceMinor, currency, locale), new: priceOf(c.newPriceMinor ?? 0, currency, locale) })}</p>
                          ) : undefined}
                          actions={item.unavailable ? <Button variant="outline" size="sm" onClick={() => remove.mutate(item.id)} loading={remove.isPending}><Trash2 aria-hidden />{tc('remove')}</Button> : undefined} />
                      );
                    })}
                    {changed.length > 0 && <Checkbox label={t('acceptChanges')} checked={accepted} onCheckedChange={setAccepted} />}
                    {unavailable.length > 0 && <p className="text-sm text-danger" role="alert">{t('removeUnavailable')}</p>}
                  </>
                )}
              </CardBody>
            </Card>
          )}

          {step === 'customer' && (
            <Card><CardHeader title={t('chooseCustomer')} /><CardBody><CustomerStep value={customer} onChange={setCustomer} errors={errors} /></CardBody></Card>
          )}

          {step === 'travellers' && items.map((item, i) => (
            <Card key={item.id}>
              <CardHeader title={item.title[locale as 'en' | 'ar']} description={item.subtitle[locale as 'en' | 'ar']} />
              <CardBody>
                <TravellerFields index={i} item={item} travellers={travellers[item.id] ?? blankTravellers(item)} details={details[item.id] ?? {}} errors={errors}
                  copyFrom={i > 0 ? travellers[items[i - 1]!.id] : undefined}
                  onChange={(list) => setTravellers((prev) => ({ ...prev, [item.id]: list }))}
                  onDetails={(d) => setDetails((prev) => ({ ...prev, [item.id]: d }))} />
              </CardBody>
            </Card>
          ))}

          {step === 'payment' && (
            <Card>
              <CardHeader title={staff ? t('paymentPlan') : t('stepPayment')} description={staff ? t('planHelp') : undefined} />
              <CardBody className="flex flex-col gap-4">
                {staff ? (
                  <PaymentPlanEditor value={plan} onChange={setPlan} totalMinor={recheck?.cart.totalMinor ?? 0} currency={currency} today={today} serviceStart={serviceStart} errors={errors} />
                ) : (
                  <CardForm value={card} onChange={setCard} errors={errors} />
                )}
                {staff && <Field label={t('notes')} optional><Input name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>}
              </CardBody>
            </Card>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => (index === 0 ? router.push(`${portalRoot}/cart`) : setStep(steps[index - 1]!))}><ArrowLeft className="flip-rtl" aria-hidden />{t('back')}</Button>
            {step === 'payment' ? (
              <Button size="lg" onClick={() => submit.mutate()} loading={submit.isPending} data-testid="submit-booking">{t('submit')}</Button>
            ) : (
              <Button onClick={next} disabled={(step === 'review' && !canLeaveReview) || (step === 'customer' && customer.mode === 'existing' && !customer.customerId)} data-testid="checkout-next">
                {t('next')}<ArrowRight className="flip-rtl" aria-hidden />
              </Button>
            )}
          </div>
        </div>
        {recheck && <CartTotals cart={recheck.cart}><p className="text-xs text-fg-muted">{t('items', { count: items.length })}</p></CartTotals>}
      </div>
    </>
  );
}

function CardForm({ value, onChange, errors }: { value: { method: 'card' | 'pay_later'; number: string; expiry: string; cvc: string; holder: string; threeDsCode: string }; onChange: (v: typeof value) => void; errors: Record<string, string> }) {
  const t = useTranslations('checkout');
  const set = (patch: Partial<typeof value>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-4" data-testid="card-form">
      <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
        {(['card', 'pay_later'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={value.method === m} onClick={() => set({ method: m })} data-method={m}
            className={cn('flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium', value.method === m ? 'border-primary bg-primary-soft/40 ring-1 ring-primary' : 'border-border hover:bg-subtle')}>
            {m === 'card' && <CreditCard className="size-4" aria-hidden />}{m === 'card' ? t('payByCard') : t('payLater')}
          </button>
        ))}
      </div>
      {errors['payment.method'] && <p role="alert" className="text-sm text-danger"><ErrorKey k={errors['payment.method']} /></p>}
      {value.method === 'card' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('cardNumber')} required error={errors['payment.card.number']} className="sm:col-span-2"><Input name="cardNumber" inputMode="numeric" dir="ltr" autoComplete="cc-number" value={value.number} onChange={(e) => set({ number: e.target.value })} /></Field>
          <Field label={t('cardExpiry')} required error={errors['payment.card.expiry']}><Input name="cardExpiry" dir="ltr" placeholder="MM/YY" autoComplete="cc-exp" value={value.expiry} onChange={(e) => set({ expiry: e.target.value })} /></Field>
          <Field label={t('cardCvc')} required error={errors['payment.card.cvc']}><Input name="cardCvc" inputMode="numeric" dir="ltr" autoComplete="cc-csc" value={value.cvc} onChange={(e) => set({ cvc: e.target.value })} /></Field>
          <Field label={t('cardHolder')} required error={errors['payment.card.holder']}><Input name="cardHolder" autoComplete="cc-name" value={value.holder} onChange={(e) => set({ holder: e.target.value })} /></Field>
          {value.number.replace(/\s/g, '') === '4000000000003220' && (
            <Field label={t('threeDs')} required error={errors['payment.card.threeDsCode']}><Input name="threeDs" inputMode="numeric" dir="ltr" value={value.threeDsCode} onChange={(e) => set({ threeDsCode: e.target.value })} /></Field>
          )}
          <p className="text-xs text-fg-muted sm:col-span-2">{t('testCards')}</p>
        </div>
      )}
    </div>
  );
}

function ErrorKey({ k }: { k: string }) {
  const t = useTranslations();
  return <>{t.has(k as never) ? t(k as never) : k}</>;
}
