import type { ServiceType } from '@travelta/contracts';
import { BedDouble, Bus, Landmark, Map, Plane, Stamp, Ticket, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/** One icon per service line, used everywhere services appear (search tabs, carts, badges, landing). */
export const SERVICE_ICONS: Record<ServiceType, LucideIcon> = {
  hotel: BedDouble,
  flight: Plane,
  tour: Map,
  visa: Stamp,
  umrah: Landmark,
  activity: Ticket,
  transfer: Bus,
};

/** Travelta mark: a stylised route arc on the brand teal. Pure SVG + tokens (no raw colours). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M8 21c3.5-8 12.5-12 17-11" fill="none" strokeWidth="2.6" strokeLinecap="round" className="stroke-on-primary" />
      <circle cx="8" cy="21" r="2.4" className="fill-accent" />
      <path d="M21.5 7.5 25 10l-3 3" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="stroke-on-primary" />
    </svg>
  );
}

export function Logo({ className, tone = 'default' }: { className?: string; tone?: 'default' | 'inverse' }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', tone === 'inverse' ? 'text-on-hero' : 'text-fg', className)}>
      <LogoMark />
      <span className="text-lg">Travelta</span>
    </span>
  );
}
