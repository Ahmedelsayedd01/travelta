'use client';

import type { Portal } from '@travelta/contracts';
import { FavoritesPage } from '@/features/favorites/favorites';
import { LocationsPage } from '@/features/locations/locations-page';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { EmptyState } from '@/components/feedback/states';
import { PlannedFeature, RequirePermission } from '@/components/portal/guards';
import { PageHeader } from '@/components/ui/page-header';
import { OrganizationsPage } from '@/features/organizations/organizations-page';
import { SubAgenciesPage } from '@/features/organizations/sub-agencies-page';
import { SettingsPage } from '@/features/settings/settings-page';
import { SuppliersPage } from '@/features/suppliers/suppliers-page';
import { TeamPage } from '@/features/team/team-page';
import { KycQueuePage } from '@/features/kyc/kyc-queue-page';
import { CommercialSettingsPage } from '@/features/pricing/commercial-settings-page';
import { PricingPage } from '@/features/pricing/pricing-page';
import { ProductsPage } from '@/features/catalog/products-page';
import { RatesPage } from '@/features/catalog/rates-page';
import { MyKycPage } from '@/features/kyc/my-kyc-page';
import { SearchPage } from '@/features/search/search-page';
import { CartPage } from '@/features/cart/cart-page';
import { CheckoutPage } from '@/features/checkout/checkout-page';
import { ManualBookingPage } from '@/features/manual/manual-booking-page';
import { BookingsScreen } from '@/features/bookings/bookings-screen';
import { AccountingPage, StatementPage } from '@/features/finance/accounting-page';
import { InvoicesScreen } from '@/features/finance/invoices-page';
import { PaymentsPage } from '@/features/finance/payments-page';
import { CrmScreen } from '@/features/crm/crm-page';
import { ReportsPage } from '@/features/reports/reports-page';
import { AccountBookingsPage, AccountProfilePage, AccountSettingsPage, AccountSupportPage, AccountTravelersPage } from '@/features/account/account-pages';
import { StorefrontSettingsPage } from '@/features/storefront/settings-page';
import { NotificationsPage, OutboxPage } from '@/features/notifications/notifications-page';
import { CustomersScreen } from '@/features/customers/customers-page';
import { AdminWalletsPage, AgencyWalletPage } from '@/features/finance/wallet-page';
import { findNavItem, moduleAllowed } from '@/lib/nav';
import { useSubscriptionAccess } from '@/features/subscriptions/hooks';
import { UpgradePrompt } from '@/features/subscriptions/subscription-page';
import { AdminSubscriptionsPage, AgencySubscriptionPage } from '@/features/subscriptions/subscription-page';
import { useSession } from '@/lib/session';
import { AuditList } from './audit-list';

/** Same nav key, two audiences: the platform reviews the compliance queue; tenants manage their own verification. */
function KycScreen() {
  const isPlatform = useSession((s) => s.session?.organization.type === 'platform');
  return isPlatform ? <KycQueuePage /> : <MyKycPage />;
}

function AuditPage() {
  const t = useTranslations('nav');
  return (
    <>
      <PageHeader title={t('auditLog')} />
      <AuditList />
    </>
  );
}

/**
 * Screen registry: nav key → screen component. Keys are shared across portals; each screen adapts to the
 * session's organization type. Nav entries without a registered screen render the planned-milestone state.
 */
const SCREENS: Partial<Record<string, ComponentType<{ segments: string[] }>>> = {
  organizations: OrganizationsPage,
  team: TeamPage,
  auditLog: AuditPage,
  subAgencies: SubAgenciesPage,
  suppliers: SuppliersPage,
  settings: SettingsPage,
  kyc: KycScreen,
  pricing: PricingPage,
  commercialSettings: CommercialSettingsPage,
  products: ProductsPage,
  inventory: ProductsPage,
  catalog: ProductsPage,
  locations: LocationsPage,
  favorites: FavoritesPage,
  rates: RatesPage,
  search: SearchPage,
  cart: CartScreen,
  checkout: CheckoutScreen,
  manualBooking: ManualBookingPage,
  bookings: BookingsScreen,
  reservations: BookingsScreen,
  wallet: () => <AgencyWalletPage />,
  finance: () => <AdminWalletsPage />,
  payments: () => <PaymentsPage />,
  invoices: InvoicesScreen,
  accounting: AccountingPage,
  statement: () => <StatementPage />,
  crm: CrmScreen,
  customers: CustomersScreen,
  subscriptions: () => <SubscriptionsScreen />,
  notifications: () => <NotificationsPage />,
  outbox: () => <OutboxPage />,
  reports: () => <ReportsPage />,
  myBookings: ({ segments }) => (segments.length === 0 ? <AccountBookingsPage /> : <BookingsScreen segments={segments} />),
  profile: () => <AccountProfilePage />,
  support: () => <AccountSupportPage />,
  travelers: () => <AccountTravelersPage />,
  accountSettings: () => <AccountSettingsPage />,
  storefront: () => <StorefrontSettingsPage />,
};

/** Cart and checkout serve agencies and storefront customers alike. */
function usePortalRoot() {
  return useSession((s) => (s.session?.portal === 'account' ? '/account' : '/agency'));
}
function CartScreen() {
  return <CartPage portalRoot={usePortalRoot()} />;
}
function CheckoutScreen() {
  return <CheckoutPage portalRoot={usePortalRoot()} />;
}

function SubscriptionsScreen() {
  const platform = useSession((s) => s.session?.organization.type === 'platform');
  return platform ? <AdminSubscriptionsPage /> : <AgencySubscriptionPage />;
}

/** Screens that own sub-paths (e.g. /bookings/:id); all others resolve only their own path. */
const DETAIL_SCREENS = new Set<string>(['bookings', 'reservations', 'invoices', 'accounting', 'crm', 'customers', 'myBookings']);

/** Resolves a portal sub-path to its nav entry and enforces that entry's permission (route-level guard). */
export function PortalSection({ portal, segments }: { portal: Portal; segments: string[] }) {
  const t = useTranslations('nav');
  const item = findNavItem(portal, segments);
  const access = useSubscriptionAccess();
  if (!item) return <EmptyState />;
  const Screen = SCREENS[item.key];
  return (
    <RequirePermission permission={item.permission}>
      {!moduleAllowed(item, access.data) ? <UpgradePrompt feature={t(item.label as never)} />
        : !Screen ? <PlannedFeature feature={t(item.label as never)} milestone={item.milestone ?? 0} />
        : segments.length === 1 || DETAIL_SCREENS.has(item.key) ? <Screen segments={segments.slice(1)} /> : <EmptyState />}
    </RequirePermission>
  );
}
