'use client';

import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from '@/i18n/navigation';

/** No customer dashboard: the storefront is home, and /account opens the trips. */
export default function AccountIndexPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/account/bookings'); }, [router]);
  return <Skeleton className="h-40 w-full" />;
}
