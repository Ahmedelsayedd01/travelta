'use client';

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <Link href={pathname} locale={locale === 'ar' ? 'en' : 'ar'} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), className)}>
      <Languages aria-hidden />
      {t('switchLanguage')}
    </Link>
  );
}
