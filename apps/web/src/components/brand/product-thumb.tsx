import type { ServiceType } from '@travelta/contracts';
import { cn } from '@/lib/cn';
import { SERVICE_ICONS } from './brand';

/**
 * Generated product artwork (the prototype ships no stock photos): a deterministic gradient from the product's
 * imageSeed in the brand's teal/navy family, with the service icon. Stable across reloads and identical on mobile.
 */
const HUES = [172, 180, 188, 196, 204, 212, 160, 168];

export function ProductThumb({ serviceType, seed, className, label }: { serviceType: ServiceType; seed: number; className?: string; label?: string }) {
  const Icon = SERVICE_ICONS[serviceType];
  const h1 = HUES[seed % HUES.length]!;
  const h2 = HUES[(seed >> 3) % HUES.length]!;
  const angle = (seed * 37) % 360;
  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('relative flex items-center justify-center overflow-hidden rounded-md text-white', className)}
      style={{ background: `linear-gradient(${angle}deg, hsl(${h1} 64% 26%), hsl(${h2} 58% 42%))` }}
    >
      <span className="absolute -end-4 -top-6 size-20 rounded-full bg-white/10" />
      <span className="absolute -bottom-8 -start-6 size-24 rounded-full bg-black/10" />
      <Icon className="relative size-1/3 max-h-10 max-w-10 opacity-90" />
    </div>
  );
}
