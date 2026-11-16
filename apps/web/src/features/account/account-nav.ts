import { Bell, Heart, LifeBuoy, Settings, Ticket, UserRound, Users, type LucideIcon } from 'lucide-react';

/** Customer account sections (storefront layout, no dashboard). Order = menu order. */
export const ACCOUNT_SECTIONS: { key: string; path: string; label: string; icon: LucideIcon }[] = [
  { key: 'profile', path: '/account/profile', label: 'profile', icon: UserRound },
  { key: 'bookings', path: '/account/bookings', label: 'bookings', icon: Ticket },
  { key: 'travelers', path: '/account/travelers', label: 'travelers', icon: Users },
  { key: 'favorites', path: '/account/favorites', label: 'favorites', icon: Heart },
  { key: 'notifications', path: '/account/notifications', label: 'notifications', icon: Bell },
  { key: 'support', path: '/account/support', label: 'support', icon: LifeBuoy },
  { key: 'settings', path: '/account/settings', label: 'settings', icon: Settings },
];
