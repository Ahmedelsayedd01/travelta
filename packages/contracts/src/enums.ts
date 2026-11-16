/**
 * Fixed enumerations (DATA_CONTRACTS §2). No free-text statuses anywhere in the platform.
 * Each list is a readonly tuple so Zod (@travelta/schemas) and TypeScript share one source.
 * Every value has an i18n label at `enums.<name>.<value>` in @travelta/i18n.
 */
export const SERVICE_TYPES = ['hotel', 'flight', 'tour', 'visa', 'umrah', 'activity', 'transfer'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const INVENTORY_SOURCES = ['extranet', 'manual', 'tbo', 'hotelbeds'] as const;
export type InventorySource = (typeof INVENTORY_SOURCES)[number];

/** Who owns the supply relationship — drives whether the platform markup layer applies (PRC-5). */
export const SUPPLIER_OWNERSHIPS = ['api', 'network', 'agency_own'] as const;
export type SupplierOwnership = (typeof SUPPLIER_OWNERSHIPS)[number];

export const ORG_TYPES = ['platform', 'agency', 'supplier'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const ORG_STATUSES = ['pending_kyc', 'active', 'suspended', 'blocked_expired_docs', 'rejected'] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const USER_TYPES = ['staff', 'customer'] as const;
export type UserType = (typeof USER_TYPES)[number];

export const CHANNELS = ['b2c', 'b2b', 'manual'] as const;
export type Channel = (typeof CHANNELS)[number];

export const BOOKING_ITEM_STATUSES = ['pending', 'confirmed', 'vouchered', 'travelled', 'cancelled', 'rejected', 'no_show'] as const;
export type BookingItemStatus = (typeof BOOKING_ITEM_STATUSES)[number];

export const HOLD_REASONS = ['awaiting_supplier', 'awaiting_payment', 'awaiting_credit_approval', 'price_changed'] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export const PAYMENT_TYPES = ['full', 'partial', 'later'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'vodafone_cash', 'instapay', 'wallet'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'authorized', 'succeeded', 'failed', 'voided', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const INSTALLMENT_STATUSES = ['pending', 'partially_paid', 'paid', 'overdue', 'cancelled'] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export const INVOICE_STATUSES = ['issued', 'partially_paid', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const REQUEST_STAGES = ['pending', 'price_quotation', 'negotiation', 'won', 'lost'] as const;
export type RequestStage = (typeof REQUEST_STAGES)[number];

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const KYC_CASE_STATUSES = ['draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected'] as const;
export type KycCaseStatus = (typeof KYC_CASE_STATUSES)[number];

export const KYC_DOC_TYPES = ['commercial_register', 'tax_card', 'tourism_license'] as const;
export type KycDocType = (typeof KYC_DOC_TYPES)[number];

export const KYC_DOC_STATUSES = ['pending', 'accepted', 'rejected', 'expired'] as const;
export type KycDocStatus = (typeof KYC_DOC_STATUSES)[number];

export const MARKUP_LAYERS = ['platform', 'agency', 'sub_agent'] as const;
export type MarkupLayer = (typeof MARKUP_LAYERS)[number];

export const MARKUP_MODES = ['percent', 'fixed'] as const;
export type MarkupMode = (typeof MARKUP_MODES)[number];

export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'suspended', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Unit of sale used by fixed markups and per-unit price lines (PRC-3). */
export const UNIT_TYPES = ['room_night', 'pax', 'seat', 'vehicle', 'ticket', 'booking'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const PAX_TYPES = ['adult', 'child', 'infant'] as const;
export type PaxType = (typeof PAX_TYPES)[number];

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
