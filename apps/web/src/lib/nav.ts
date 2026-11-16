import type { Permission, Portal } from '@travelta/contracts';
import {
  BadgeCheck, BarChart3, Heart, MapPin, BedDouble, Building2, CalendarRange, ClipboardList, Coins, FileText, Gauge, History, Landmark, LayoutDashboard,
  Inbox, Layers, LifeBuoy, Network, BellRing, Package, PenSquare, Receipt, Search, Settings, ShoppingCart, ShieldCheck, SlidersHorizontal, Store, Ticket, Truck, User, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * Data-driven portal navigation (FRONTEND_ARCHITECTURE §3). Items are filtered by the session's permissions;
 * the same entries drive route-level guards, so a hidden item is also an inaccessible URL.
 * `milestone` marks areas whose screens are delivered in a later milestone of the agreed roadmap.
 */
export interface NavItem {
  key: string;
  /** i18n key under `nav.` */
  label: string;
  /** Path below the portal root ('' = portal home). */
  path: string;
  icon: LucideIcon;
  permission?: Permission;
  milestone?: number;
  /** Routed and guarded like any entry, but reached from inside a flow rather than the sidebar (cart, checkout). */
  hidden?: boolean;
  /** SUB-3: plan module (or the storefront add-on) the entry needs. */
  module?: 'crm' | 'accounting' | 'sub_agencies' | 'storefront';
}

/** Plan access as returned by `subscriptions.access`; null/undefined modules = no subscription (everything allowed). */
export interface PlanAccess { modules: readonly string[] | null; storefront: boolean }
export function moduleAllowed(item: Pick<NavItem, 'module'>, access: PlanAccess | undefined): boolean {
  if (!item.module || !access || access.modules === null) return true;
  return item.module === 'storefront' ? access.storefront : access.modules.includes(item.module);
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: Record<Portal, NavGroup[]> = {
  admin: [
    { label: 'groupMain', items: [{ key: 'dashboard', label: 'dashboard', path: '', icon: LayoutDashboard, permission: 'platform.dashboard' }] },
    {
      label: 'groupAdmin',
      items: [
        { key: 'organizations', label: 'organizations', path: 'organizations', icon: Building2, permission: 'organizations.view' },
        { key: 'kyc', label: 'kyc', path: 'kyc', icon: ShieldCheck, permission: 'kyc.review' },
        { key: 'suppliers', label: 'suppliers', path: 'suppliers', icon: Truck, permission: 'suppliers.view' },
        { key: 'catalog', label: 'catalog', path: 'catalog', icon: Layers, permission: 'inventory.view' },
        { key: 'locations', label: 'locations', path: 'locations', icon: MapPin, permission: 'locations.manage' },
        { key: 'bookings', label: 'bookings', path: 'bookings', icon: Ticket, permission: 'bookings.view' },
        { key: 'team', label: 'team', path: 'team', icon: Users, permission: 'team.view' },
      ],
    },
    {
      label: 'groupFinance',
      items: [
        { key: 'pricing', label: 'pricing', path: 'pricing', icon: SlidersHorizontal, permission: 'pricing.view' },
        { key: 'commercialSettings', label: 'commercialSettings', path: 'commercial-settings', icon: Coins, permission: 'commercial_settings.view' },
        { key: 'finance', label: 'finance', path: 'wallets', icon: Wallet, permission: 'wallet.view' },
        { key: 'accounting', label: 'accounting', path: 'accounting', icon: Landmark, permission: 'accounting.view' },
        { key: 'subscriptions', label: 'subscriptions', path: 'subscriptions', icon: BadgeCheck, permission: 'subscriptions.view' },
      ],
    },
    {
      label: 'groupOperations',
      items: [
        { key: 'reports', label: 'reports', path: 'reports', icon: BarChart3, permission: 'reports.view' },
        { key: 'outbox', label: 'outbox', path: 'outbox', icon: Inbox, permission: 'bookings.view' },
        { key: 'auditLog', label: 'auditLog', path: 'audit-log', icon: History, permission: 'audit.view' },
        { key: 'settings', label: 'settings', path: 'settings', icon: Settings, permission: 'settings.manage' },
        { key: 'notifications', label: 'notifications', path: 'notifications', icon: BellRing, hidden: true },
      ],
    },
  ],
  agency: [
    { label: 'groupMain', items: [{ key: 'dashboard', label: 'dashboard', path: '', icon: LayoutDashboard }] },
    {
      label: 'groupSales',
      items: [
        { key: 'search', label: 'search', path: 'search', icon: Search, permission: 'bookings.create' },
        { key: 'manualBooking', label: 'manualBooking', path: 'manual-booking', icon: PenSquare, permission: 'bookings.create' },
        { key: 'cart', label: 'cart', path: 'cart', icon: ShoppingCart, permission: 'bookings.create', hidden: true },
        { key: 'checkout', label: 'checkout', path: 'checkout', icon: ShoppingCart, permission: 'bookings.create', hidden: true },
        { key: 'bookings', label: 'bookings', path: 'bookings', icon: Ticket, permission: 'bookings.view' },
        { key: 'customers', label: 'customers', path: 'customers', icon: Users, permission: 'customers.view' },
        { key: 'crm', label: 'crm', path: 'crm', icon: ClipboardList, permission: 'crm.view', module: 'crm' },
        { key: 'subAgencies', label: 'subAgencies', path: 'sub-agencies', icon: Network, permission: 'sub_agencies.view', module: 'sub_agencies' },
      ],
    },
    {
      label: 'groupFinance',
      items: [
        { key: 'wallet', label: 'wallet', path: 'wallet', icon: Wallet, permission: 'wallet.view' },
        { key: 'payments', label: 'payments', path: 'payments', icon: Coins, permission: 'payments.view' },
        { key: 'invoices', label: 'invoices', path: 'invoices', icon: Receipt, permission: 'invoices.view' },
        { key: 'accounting', label: 'accounting', path: 'accounting', icon: Landmark, permission: 'accounting.view', module: 'accounting' },
        { key: 'pricing', label: 'pricing', path: 'pricing', icon: SlidersHorizontal, permission: 'pricing.view' },
      ],
    },
    {
      label: 'groupAdmin',
      items: [
        { key: 'suppliers', label: 'suppliers', path: 'suppliers', icon: Truck, permission: 'suppliers.view' },
        { key: 'inventory', label: 'inventory', path: 'inventory', icon: BedDouble, permission: 'inventory.view' },
        { key: 'rates', label: 'rates', path: 'rates', icon: CalendarRange, permission: 'inventory.manage' },
        { key: 'storefront', label: 'storefront', path: 'storefront', icon: Store, permission: 'storefront.view', module: 'storefront' },
        { key: 'kyc', label: 'kyc', path: 'kyc', icon: ShieldCheck, permission: 'kyc.view_own' },
        { key: 'team', label: 'team', path: 'team', icon: Users, permission: 'team.view' },
        { key: 'subscriptions', label: 'subscriptions', path: 'subscription', icon: BadgeCheck, permission: 'subscriptions.view' },
        { key: 'reports', label: 'reports', path: 'reports', icon: BarChart3, permission: 'reports.view' },
        { key: 'outbox', label: 'outbox', path: 'outbox', icon: Inbox, permission: 'bookings.view' },
        { key: 'auditLog', label: 'auditLog', path: 'audit-log', icon: History, permission: 'audit.view' },
        { key: 'settings', label: 'settings', path: 'settings', icon: Settings, permission: 'settings.manage' },
        { key: 'notifications', label: 'notifications', path: 'notifications', icon: BellRing, hidden: true },
      ],
    },
  ],
  supplier: [
    { label: 'groupMain', items: [{ key: 'dashboard', label: 'dashboard', path: '', icon: Gauge }] },
    {
      label: 'groupOperations',
      items: [
        { key: 'products', label: 'products', path: 'products', icon: Package, permission: 'inventory.view' },
        { key: 'rates', label: 'rates', path: 'rates', icon: CalendarRange, permission: 'inventory.manage' },
        { key: 'reservations', label: 'reservations', path: 'reservations', icon: Ticket, permission: 'bookings.view' },
      ],
    },
    {
      label: 'groupFinance',
      items: [
        { key: 'statement', label: 'statement', path: 'statement', icon: FileText, permission: 'accounting.view' },
        { key: 'reports', label: 'reports', path: 'reports', icon: BarChart3, permission: 'reports.view' },
      ],
    },
    {
      label: 'groupAdmin',
      items: [
        { key: 'kyc', label: 'kyc', path: 'kyc', icon: ShieldCheck, permission: 'kyc.view_own' },
        { key: 'team', label: 'team', path: 'team', icon: Users, permission: 'team.view' },
        { key: 'auditLog', label: 'auditLog', path: 'audit-log', icon: History, permission: 'audit.view' },
        { key: 'settings', label: 'settings', path: 'settings', icon: Settings, permission: 'settings.manage' },
        { key: 'notifications', label: 'notifications', path: 'notifications', icon: BellRing, hidden: true },
      ],
    },
  ],
  account: [
    { label: 'groupMain', items: [{ key: 'dashboard', label: 'dashboard', path: '', icon: LayoutDashboard }] },
    {
      label: 'groupSales',
      items: [
        { key: 'myBookings', label: 'myBookings', path: 'bookings', icon: Ticket },
        { key: 'favorites', label: 'favorites', path: 'favorites', icon: Heart },
        { key: 'profile', label: 'profile', path: 'profile', icon: User },
        { key: 'support', label: 'support', path: 'support', icon: LifeBuoy },
        { key: 'cart', label: 'cart', path: 'cart', icon: ShoppingCart, hidden: true },
        { key: 'checkout', label: 'checkout', path: 'checkout', icon: ShoppingCart, hidden: true },
        { key: 'notifications', label: 'notifications', path: 'notifications', icon: BellRing, hidden: true },
      ],
    },
  ],
};

/** Root path of each portal (below /[locale]). */
export const PORTAL_ROOT: Record<Portal, string> = { admin: '/admin', agency: '/agency', supplier: '/supplier', account: '/account' };

export function visibleNav(portal: Portal, permissions: ReadonlySet<Permission>, access?: PlanAccess): NavGroup[] {
  return NAV[portal]
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.hidden && (!i.permission || permissions.has(i.permission)) && moduleAllowed(i, access)) }))
    .filter((g) => g.items.length > 0);
}

/** The nav entry a portal sub-path belongs to (first path segment), used by route guards. */
export function findNavItem(portal: Portal, segments: string[]): NavItem | undefined {
  const path = segments[0] ?? '';
  return NAV[portal].flatMap((g) => g.items).find((i) => i.path === path);
}

/** Only allow post-login redirects to a path inside the portal the session belongs to. */
export function safeNext(next: string | null | undefined, portal: Portal): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  const withoutLocale = next.replace(/^\/(en|ar)(?=\/|$)/, '') || '/';
  return withoutLocale === PORTAL_ROOT[portal] || withoutLocale.startsWith(`${PORTAL_ROOT[portal]}/`) ? withoutLocale : null;
}
