import {
  placeEntitySchema, type PlaceEntity, savedTravelerEntitySchema, type SavedTravelerEntity, supportTicketEntitySchema, type SupportTicketEntity, favoriteEntitySchema, type FavoriteEntity, authCodeEntitySchema, type AuthCodeEntity,
  auditLogEntitySchema, countryEntitySchema, currencyEntitySchema, destinationEntitySchema, fxRateEntitySchema, membershipEntitySchema,
  nationalityGroupEntitySchema, organizationEntitySchema, roleEntitySchema, sessionEntitySchema, userEntitySchema,
  type AuditLogEntity, type CountryEntity, type CurrencyEntity, type DestinationEntity, type FxRateEntity, type MembershipEntity,
  type NationalityGroupEntity, type OrganizationEntity, type AgencySupplierEntity, type SupplierContractEntity,
  agencySupplierEntitySchema, supplierContractEntitySchema,
  kycCaseEntitySchema, kycDecisionEntitySchema, kycDocumentEntitySchema, serviceLineEntitySchema,
  type KycCaseEntity, type KycDecisionEntity, type KycDocumentEntity, type ServiceLineEntity,
  commercialSettingsEntitySchema, feeRuleEntitySchema, markupRuleEntitySchema, markupRuleVersionEntitySchema, promoCodeEntitySchema, taxProfileEntitySchema,
  calendarOverrideEntitySchema, productEntitySchema, type CalendarOverrideEntity, type ProductEntity,
  bookingEntitySchema, bookingEventEntitySchema, bookingItemEntitySchema, cartEntitySchema, customerEntitySchema,
  type BookingEntity, type BookingEventEntity, type BookingItemEntity, type CartEntity, type CustomerEntity, supplierRequestLogEntitySchema, type SupplierRequestLogEntity,
  paymentPlanEntitySchema, paymentEntitySchema, walletEntitySchema, walletTransactionEntitySchema, walletHoldEntitySchema, topUpRequestEntitySchema, invoiceEntitySchema, creditNoteEntitySchema, cancellationEntitySchema, ledgerAccountEntitySchema, financialAccountEntitySchema, journalEntryEntitySchema, supplierPayableEntitySchema, expenseEntitySchema, transferEntitySchema,
  type PaymentPlanEntity, type PaymentEntity, type WalletEntity, type WalletTransactionEntity, type WalletHoldEntity, type TopUpRequestEntity, type InvoiceEntity, type CreditNoteEntity, type CancellationEntity, type LedgerAccountEntity, type FinancialAccountEntity, type JournalEntryEntity, type SupplierPayableEntity, type ExpenseEntity, type TransferEntity,
  leadEntitySchema, crmRequestEntitySchema, quotationEntitySchema, followUpEntitySchema, activityEntitySchema,
  type LeadEntity, type CrmRequestEntity, type QuotationEntity, type FollowUpEntity, type ActivityEntity,
  subscriptionPlanEntitySchema, subscriptionEntitySchema, subscriptionInvoiceEntitySchema,
  type SubscriptionPlanEntity, type SubscriptionEntity, type SubscriptionInvoiceEntity,
  notificationEntitySchema, outboxMessageEntitySchema, type NotificationEntity, type OutboxMessageEntity,
  storefrontEntitySchema, type StorefrontEntity,
  type CommercialSettingsEntity, type FeeRuleEntity, type MarkupRuleEntity, type MarkupRuleVersionEntity, type PromoCodeEntity, type TaxProfileEntity, type RoleEntity, type SessionEntity, type UserEntity, type z,
} from '@travelta/schemas';

/**
 * Storage collections ⇄ future Postgres tables (DATABASE_DESIGN). Each milestone registers its entities here;
 * the schema is used to validate imported snapshots and (in tests) every seeded row.
 */
export interface Collections {
  currencies: CurrencyEntity;
  countries: CountryEntity;
  nationalityGroups: NationalityGroupEntity;
  destinations: DestinationEntity;
  places: PlaceEntity;
  favorites: FavoriteEntity;
  savedTravelers: SavedTravelerEntity;
  supportTickets: SupportTicketEntity;
  fxRates: FxRateEntity;
  organizations: OrganizationEntity;
  users: UserEntity;
  roles: RoleEntity;
  memberships: MembershipEntity;
  sessions: SessionEntity;
  authCodes: AuthCodeEntity;
  auditLogs: AuditLogEntity;
  agencySuppliers: AgencySupplierEntity;
  supplierContracts: SupplierContractEntity;
  kycCases: KycCaseEntity;
  kycDocuments: KycDocumentEntity;
  kycDecisions: KycDecisionEntity;
  serviceLines: ServiceLineEntity;
  commercialSettings: CommercialSettingsEntity;
  markupRules: MarkupRuleEntity;
  markupRuleVersions: MarkupRuleVersionEntity;
  taxProfiles: TaxProfileEntity;
  feeRules: FeeRuleEntity;
  promoCodes: PromoCodeEntity;
  products: ProductEntity;
  calendarOverrides: CalendarOverrideEntity;
  customers: CustomerEntity;
  carts: CartEntity;
  bookings: BookingEntity;
  bookingItems: BookingItemEntity;
  bookingEvents: BookingEventEntity;
  supplierRequestLogs: SupplierRequestLogEntity;
  paymentPlans: PaymentPlanEntity;
  payments: PaymentEntity;
  wallets: WalletEntity;
  walletTransactions: WalletTransactionEntity;
  walletHolds: WalletHoldEntity;
  topUpRequests: TopUpRequestEntity;
  invoices: InvoiceEntity;
  creditNotes: CreditNoteEntity;
  cancellations: CancellationEntity;
  ledgerAccounts: LedgerAccountEntity;
  financialAccounts: FinancialAccountEntity;
  journalEntries: JournalEntryEntity;
  supplierPayables: SupplierPayableEntity;
  expenses: ExpenseEntity;
  transfers: TransferEntity;
  leads: LeadEntity;
  crmRequests: CrmRequestEntity;
  quotations: QuotationEntity;
  followUps: FollowUpEntity;
  activities: ActivityEntity;
  subscriptionPlans: SubscriptionPlanEntity;
  subscriptions: SubscriptionEntity;
  subscriptionInvoices: SubscriptionInvoiceEntity;
  notifications: NotificationEntity;
  outboxMessages: OutboxMessageEntity;
  storefronts: StorefrontEntity;
}

export type CollectionName = keyof Collections;

export const collectionSchemas: { [K in CollectionName]: z.ZodType<Collections[K]> } = {
  currencies: currencyEntitySchema,
  countries: countryEntitySchema,
  nationalityGroups: nationalityGroupEntitySchema,
  destinations: destinationEntitySchema,
  places: placeEntitySchema,
  favorites: favoriteEntitySchema,
  savedTravelers: savedTravelerEntitySchema,
  supportTickets: supportTicketEntitySchema,
  fxRates: fxRateEntitySchema,
  organizations: organizationEntitySchema,
  users: userEntitySchema,
  roles: roleEntitySchema,
  memberships: membershipEntitySchema,
  sessions: sessionEntitySchema,
  authCodes: authCodeEntitySchema,
  auditLogs: auditLogEntitySchema,
  agencySuppliers: agencySupplierEntitySchema,
  supplierContracts: supplierContractEntitySchema,
  kycCases: kycCaseEntitySchema,
  kycDocuments: kycDocumentEntitySchema,
  kycDecisions: kycDecisionEntitySchema,
  serviceLines: serviceLineEntitySchema,
  commercialSettings: commercialSettingsEntitySchema,
  markupRules: markupRuleEntitySchema,
  markupRuleVersions: markupRuleVersionEntitySchema,
  taxProfiles: taxProfileEntitySchema,
  feeRules: feeRuleEntitySchema,
  promoCodes: promoCodeEntitySchema,
  products: productEntitySchema,
  calendarOverrides: calendarOverrideEntitySchema,
  customers: customerEntitySchema,
  carts: cartEntitySchema,
  bookings: bookingEntitySchema,
  bookingItems: bookingItemEntitySchema,
  bookingEvents: bookingEventEntitySchema,
  supplierRequestLogs: supplierRequestLogEntitySchema,
  paymentPlans: paymentPlanEntitySchema,
  payments: paymentEntitySchema,
  wallets: walletEntitySchema,
  walletTransactions: walletTransactionEntitySchema,
  walletHolds: walletHoldEntitySchema,
  topUpRequests: topUpRequestEntitySchema,
  invoices: invoiceEntitySchema,
  creditNotes: creditNoteEntitySchema,
  cancellations: cancellationEntitySchema,
  ledgerAccounts: ledgerAccountEntitySchema,
  financialAccounts: financialAccountEntitySchema,
  journalEntries: journalEntryEntitySchema,
  supplierPayables: supplierPayableEntitySchema,
  expenses: expenseEntitySchema,
  transfers: transferEntitySchema,
  leads: leadEntitySchema,
  crmRequests: crmRequestEntitySchema,
  quotations: quotationEntitySchema,
  followUps: followUpEntitySchema,
  activities: activityEntitySchema,
  subscriptionPlans: subscriptionPlanEntitySchema,
  subscriptions: subscriptionEntitySchema,
  subscriptionInvoices: subscriptionInvoiceEntitySchema,
  notifications: notificationEntitySchema,
  outboxMessages: outboxMessageEntitySchema,
  storefronts: storefrontEntitySchema,
};

export const COLLECTION_NAMES = Object.keys(collectionSchemas) as CollectionName[];

/** Bump when a stored entity shape changes incompatibly; older snapshots are reseeded (with notice). */
export const SCHEMA_VERSION = 18;
