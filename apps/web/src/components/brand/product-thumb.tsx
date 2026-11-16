'use client';

import type { ServiceType } from '@travelta/contracts';
import { imageForProduct, TRAVEL_IMAGES, type TravelImageKey } from '@travelta/shared';
import Image from 'next/image';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { SERVICE_ICONS } from './brand';

/**
 * Product artwork: a licensed photo of the product's own service (deterministic per product via imageSeed — a visa
 * never shows a hotel), with a small service badge. If the photo can't load, the generated brand gradient is shown.
 * Decorative by default (the product name is always next to it); pass `label` to expose it as an image.
 */
const HUES = [172, 180, 188, 196, 204, 212, 160, 168];

export function ProductThumb({ serviceType, seed, className, label, sizes = '(min-width: 1024px) 240px, 100vw', priority, image }: {
  serviceType: ServiceType; seed: number; className?: string; label?: string; sizes?: string; priority?: boolean;
  /** Explicit photo (e.g. a row that wants distinct photos per card); must belong to the same service. */
  image?: TravelImageKey;
}) {
  const Icon = SERVICE_ICONS[serviceType];
  const key = image ?? imageForProduct(serviceType, seed);
  const [failed, setFailed] = useState(false);
  const h1 = HUES[seed % HUES.length]!;
  const h2 = HUES[(seed >> 3) % HUES.length]!;
  return (
    <div role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} data-photo={failed ? undefined : key}
      className={cn('relative flex items-center justify-center overflow-hidden rounded-md bg-subtle text-white', className)}
      style={failed ? { background: `linear-gradient(${(seed * 37) % 360}deg, hsl(${h1} 64% 26%), hsl(${h2} 58% 42%))` } : undefined}>
      {failed ? <Icon className="relative size-1/3 max-h-10 max-w-10 opacity-90" /> : (
        <>
          <Image src={`/images/travel/card/${key}.jpg`} alt="" fill sizes={sizes} priority={priority} className="object-cover" onError={() => setFailed(true)} />
          <span className="absolute start-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-white"><Icon className="size-4" /></span>
        </>
      )}
    </div>
  );
}

/** A catalogue photo with localized alt text (hero, auth panels, destination and service cards). */
export function TravelPhoto({ image, variant = 'card', className, sizes, priority, decorative }: {
  image: TravelImageKey; variant?: 'hero' | 'card'; className?: string; sizes?: string; priority?: boolean; decorative?: boolean;
}) {
  const locale = useLocale() as 'en' | 'ar';
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn('relative overflow-hidden bg-secondary', className)} data-photo={image}>
      {!failed && (
        <Image src={variant === 'hero' ? `/images/travel/${image}.jpg` : `/images/travel/card/${image}.jpg`} alt={decorative ? '' : TRAVEL_IMAGES[image].alt[locale]}
          fill sizes={sizes ?? (variant === 'hero' ? '100vw' : '(min-width: 1024px) 33vw, 100vw')} priority={priority} className="object-cover" onError={() => setFailed(true)} />
      )}
    </div>
  );
}
