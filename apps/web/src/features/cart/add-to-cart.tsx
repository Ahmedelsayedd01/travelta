'use client';

import type { SearchInput } from '@travelta/schemas';
import { ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useApi } from '@/components/api-provider';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { useAction } from '@/lib/mutations';

/** Turns the chosen offer into a 15-minute quote in the server-side cart (QTE-1). */
export function AddToCartButton({ offerId, input, onAdded, cartHref, storefront }: { offerId: string; input: SearchInput; onAdded?: () => void; cartHref: string; storefront?: string }) {
  const t = useTranslations('cart');
  const api = useApi();
  const router = useRouter();
  const add = useAction(() => api.call('cart.addOffer', { offerId, customerType: input.customerType, channel: input.channel, nationalityIso2: input.nationalityIso2, storefront }), {
    invalidate: [['cart']],
    onSuccess: () => {
      toast.success(t('added'), { action: { label: t('viewCart'), onClick: () => router.push(cartHref) } });
      onAdded?.();
    },
  });
  return (
    <Button onClick={() => add.mutate()} loading={add.isPending} data-testid="add-to-cart">
      <ShoppingCart aria-hidden />{t('addToCart')}
    </Button>
  );
}
