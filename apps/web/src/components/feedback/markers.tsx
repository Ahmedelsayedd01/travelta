'use client';

import { FlaskConical, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';

/** Marks an action that is frontend-simulated and must be server/external-authoritative in production. */
export function SimulationBadge() {
  const t = useTranslations('common');
  return (
    <Badge tone="info" title={t('simulatedHint')}>
      <FlaskConical className="size-3" aria-hidden />
      {t('simulated')}
    </Badge>
  );
}

/** Marks a commercial value (markup, commission, plan price, credit limit) that is a DEMO value, not an approved term. */
export function DemoBadge() {
  const t = useTranslations('common');
  return (
    <Badge tone="highlight" title={t('demoValueHint')}>
      <Sparkles className="size-3" aria-hidden />
      {t('demo')}
    </Badge>
  );
}
