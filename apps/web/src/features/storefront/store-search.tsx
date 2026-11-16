'use client';

import { LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MockApiGate } from '@/components/api-provider';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { AddToCartButton } from '@/features/cart/add-to-cart';
import { SearchExperience } from '@/features/search/search-page';
import { Link } from '@/i18n/navigation';
import { useCustomer } from './store-shell';

function StoreResults() {
  const t = useTranslations('store');
  const { customer } = useCustomer();
  return (
    <SearchExperience staff={false} header={<PageHeader title={t('searchTitle')} description={t('searchDescription')} />}
      offerActions={(offerId, _result, input, close) => customer
        ? <AddToCartButton offerId={offerId} input={input} onAdded={close} cartHref="/account/cart" />
        : <Link href={`/account/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`.replace(/^\/(en|ar)/, ''))}`} className={buttonVariants({ variant: 'primary' })} data-testid="sign-in-to-book"><LogIn aria-hidden />{t('signInToBook')}</Link>} />
  );
}

/** Public search & discovery (W12): prices for the storefront audience; booking needs a customer account. */
export function StoreSearch() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <MockApiGate><StoreResults /></MockApiGate>
    </div>
  );
}
