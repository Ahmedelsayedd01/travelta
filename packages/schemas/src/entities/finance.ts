import { z } from 'zod';
import { currencySchema, isoDateSchema, isoDateTimeSchema, localizedTextSchema, minorAmountSchema } from '../primitives';
import { installmentStatusSchema, invoiceStatusSchema, paymentMethodSchema, paymentStatusSchema, paymentTypeSchema } from '../enums';
import { tenantEntityBaseSchema } from './base';
import { kycFileSchema } from './kyc';

// ---- Payments & instalments (PAY) ---------------------------------------------------------------------------------
export const installmentSchema = z.object({
  seq: z.number().int().min(1),
  amountMinor: minorAmountSchema,
  dueDate: isoDateSchema,
  paidMinor: minorAmountSchema,
  status: installmentStatusSchema,
});
export type Installment = z.infer<typeof installmentSchema>;

/** tenantId = the seller collecting from its customer. */
export const paymentPlanEntitySchema = tenantEntityBaseSchema.extend({
  bookingId: z.string(),
  type: paymentTypeSchema,
  currency: currencySchema,
  installments: z.array(installmentSchema).min(1),
});
export type PaymentPlanEntity = z.infer<typeof paymentPlanEntitySchema>;

export const GATEWAYS = ['none', 'paymob', 'stripe', 'paypal'] as const;
export const paymentAllocationSchema = z.object({ financialAccountId: z.string(), amountMinor: z.number().int().positive() });

export const paymentEntitySchema = tenantEntityBaseSchema.extend({
  bookingId: z.string().nullable(),
  invoiceId: z.string().nullable(),
  customerId: z.string().nullable(),
  /** in = collection from a customer; out = refund to a customer. */
  direction: z.enum(['in', 'out']),
  method: paymentMethodSchema,
  gateway: z.enum(GATEWAYS),
  amountMinor: minorAmountSchema,
  currency: currencySchema,
  status: paymentStatusSchema,
  /** Split collection across financial accounts (PAY-3). */
  allocations: z.array(paymentAllocationSchema),
  reference: z.string(),
  cardLast4: z.string().nullable(),
  receivedAt: isoDateTimeSchema,
  recordedByUserId: z.string().nullable(),
  journalEntryId: z.string().nullable(),
  note: z.string().max(500),
});
export type PaymentEntity = z.infer<typeof paymentEntitySchema>;

// ---- Wallet & credit (WAL) ----------------------------------------------------------------------------------------
/** tenantId = the wallet owner (agency / sub-agency); heldAtOrgId = platform, or the parent agency for sub-agencies. */
export const walletEntitySchema = tenantEntityBaseSchema.extend({
  heldAtOrgId: z.string(),
  currency: currencySchema,
  /** Cached; always equals the sum of wallet transactions (WAL-6). */
  balanceMinor: minorAmountSchema,
  creditLimitMinor: z.number().int().min(0),
  status: z.enum(['active', 'frozen']),
});
export type WalletEntity = z.infer<typeof walletEntitySchema>;

export const WALLET_TX_TYPES = ['top_up', 'booking_debit', 'refund_credit', 'adjustment'] as const;
export const walletTransactionEntitySchema = tenantEntityBaseSchema.extend({
  walletId: z.string(),
  type: z.enum(WALLET_TX_TYPES),
  /** Signed: credits positive, debits negative. */
  amountMinor: minorAmountSchema,
  balanceAfterMinor: minorAmountSchema,
  bookingId: z.string().nullable(),
  note: z.string().max(300),
  at: isoDateTimeSchema,
  actorUserId: z.string().nullable(),
});
export type WalletTransactionEntity = z.infer<typeof walletTransactionEntitySchema>;

export const walletHoldEntitySchema = tenantEntityBaseSchema.extend({
  walletId: z.string(),
  bookingId: z.string(),
  itemId: z.string(),
  amountMinor: z.number().int().positive(),
  status: z.enum(['active', 'captured', 'released']),
  /** WAL-4: the booking waits for a top-up or an over-limit approval. */
  awaitingApproval: z.boolean(),
  approvedByUserId: z.string().nullable(),
});
export type WalletHoldEntity = z.infer<typeof walletHoldEntitySchema>;

export const topUpRequestEntitySchema = tenantEntityBaseSchema.extend({
  walletId: z.string(),
  amountMinor: z.number().int().positive(),
  method: z.enum(['bank_transfer', 'cash', 'instapay', 'vodafone_cash', 'card']),
  reference: z.string().max(80),
  proof: kycFileSchema.nullable(),
  status: z.enum(['pending', 'approved', 'rejected']),
  requestedByUserId: z.string(),
  decidedByUserId: z.string().nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  reason: z.string().max(300).nullable(),
});
export type TopUpRequestEntity = z.infer<typeof topUpRequestEntitySchema>;

// ---- Invoices, credit notes, cancellations (INV, CAN) -------------------------------------------------------------
export const invoiceLineSchema = z.object({ itemId: z.string().nullable(), description: z.string(), amountMinor: minorAmountSchema, taxMinor: minorAmountSchema });

export const invoiceEntitySchema = tenantEntityBaseSchema.extend({
  number: z.string(),
  bookingId: z.string(),
  customerId: z.string().nullable(),
  billTo: z.object({ name: z.string(), email: z.string(), phone: z.string() }),
  currency: currencySchema,
  lines: z.array(invoiceLineSchema),
  subtotalMinor: minorAmountSchema,
  taxMinor: minorAmountSchema,
  /** INV-2: after-tax adjustments. */
  discountMinor: z.number().int().min(0),
  extraFeesMinor: z.number().int().min(0),
  totalMinor: minorAmountSchema,
  paidMinor: minorAmountSchema,
  creditedMinor: minorAmountSchema,
  status: invoiceStatusSchema,
  notes: z.string().max(1000),
  issuedAt: isoDateTimeSchema,
});
export type InvoiceEntity = z.infer<typeof invoiceEntitySchema>;

export const creditNoteEntitySchema = tenantEntityBaseSchema.extend({
  number: z.string(),
  invoiceId: z.string(),
  bookingId: z.string(),
  itemId: z.string(),
  cancellationId: z.string(),
  currency: currencySchema,
  /** Cancelled value (incl. tax) minus the customer fee. */
  amountMinor: minorAmountSchema,
  taxMinor: minorAmountSchema,
  feeMinor: minorAmountSchema,
  issuedAt: isoDateTimeSchema,
});
export type CreditNoteEntity = z.infer<typeof creditNoteEntitySchema>;

export const cancellationEntitySchema = tenantEntityBaseSchema.extend({
  bookingId: z.string(),
  itemId: z.string(),
  requestedByUserId: z.string(),
  reason: z.string().max(500),
  daysBefore: z.number().int(),
  /** CAN-2: policy on the sell price (customer) and on the net (supplier). */
  customerFeeMinor: minorAmountSchema,
  supplierFeeMinor: minorAmountSchema,
  adminFeeMinor: minorAmountSchema,
  refundMinor: minorAmountSchema,
  refundMethod: z.enum(['wallet', 'card', 'cash', 'bank_transfer', 'none']),
  status: z.enum(['requested', 'approved', 'rejected', 'completed']),
  decidedByUserId: z.string().nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
});
export type CancellationEntity = z.infer<typeof cancellationEntitySchema>;

// ---- Double-entry accounting (ACC) --------------------------------------------------------------------------------
export const LEDGER_ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;
export const ledgerAccountTypeSchema = z.enum(LEDGER_ACCOUNT_TYPES);

/** System accounts every tenant ledger gets (posting rules address them by key). */
export const LEDGER_SYSTEM_KEYS = [
  'cash', 'bank', 'vodafone_cash', 'instapay', 'card_clearing', 'ar', 'prepaid_wallet', 'agency_wallet_liability', 'refund_payable',
  'ap_supplier', 'tax_payable', 'equity', 'sales_revenue', 'platform_markup_revenue', 'commission_revenue', 'fee_revenue', 'subscription_revenue',
  'cost_of_sales', 'expense_general', 'expense_rent', 'expense_salaries', 'expense_marketing',
] as const;
export type LedgerSystemKey = (typeof LEDGER_SYSTEM_KEYS)[number];

export const ledgerAccountEntitySchema = tenantEntityBaseSchema.extend({
  code: z.string().min(3).max(10),
  name: localizedTextSchema,
  type: ledgerAccountTypeSchema,
  systemKey: z.enum(LEDGER_SYSTEM_KEYS).nullable(),
  active: z.boolean(),
});
export type LedgerAccountEntity = z.infer<typeof ledgerAccountEntitySchema>;

export const FINANCIAL_ACCOUNT_KINDS = ['cash', 'bank', 'vodafone_cash', 'instapay', 'card_gateway'] as const;
export const financialAccountEntitySchema = tenantEntityBaseSchema.extend({
  kind: z.enum(FINANCIAL_ACCOUNT_KINDS),
  name: z.string().min(2).max(80),
  ledgerAccountId: z.string(),
  currency: currencySchema,
  active: z.boolean(),
});
export type FinancialAccountEntity = z.infer<typeof financialAccountEntitySchema>;

export const JOURNAL_SOURCES = ['booking', 'payment', 'refund', 'expense', 'top_up', 'transfer', 'adjustment', 'cancellation', 'payout'] as const;
export const journalLineSchema = z.object({
  accountId: z.string(),
  debitMinor: z.number().int().min(0),
  creditMinor: z.number().int().min(0),
  party: z.object({ kind: z.enum(['customer', 'supplier', 'agency']), id: z.string(), name: z.string() }).nullable(),
});
export type JournalLine = z.infer<typeof journalLineSchema>;

export const journalEntryEntitySchema = tenantEntityBaseSchema.extend({
  number: z.string(),
  date: isoDateSchema,
  memo: z.string().max(300),
  source: z.enum(JOURNAL_SOURCES),
  sourceId: z.string().nullable(),
  bookingId: z.string().nullable(),
  postedByUserId: z.string().nullable(),
  reversalOf: z.string().nullable(),
  currency: currencySchema,
  lines: z.array(journalLineSchema).min(2),
});
export type JournalEntryEntity = z.infer<typeof journalEntryEntitySchema>;

/** tenantId = who owes the supplier (platform for network/API stock, the agency for its own suppliers). */
export const supplierPayableEntitySchema = tenantEntityBaseSchema.extend({
  bookingId: z.string(),
  itemId: z.string(),
  supplierKind: z.enum(['network', 'own', 'api']),
  supplierRefId: z.string(),
  supplierName: z.string(),
  currency: currencySchema,
  amountDueMinor: minorAmountSchema,
  amountPaidMinor: minorAmountSchema,
  dueDate: isoDateSchema,
  status: z.enum(['open', 'partially_paid', 'paid', 'cancelled']),
});
export type SupplierPayableEntity = z.infer<typeof supplierPayableEntitySchema>;

export const EXPENSE_CATEGORIES = ['general', 'rent', 'salaries', 'marketing'] as const;
export const expenseEntitySchema = tenantEntityBaseSchema.extend({
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().min(2).max(200),
  amountMinor: z.number().int().positive(),
  currency: currencySchema,
  financialAccountId: z.string(),
  date: isoDateSchema,
  journalEntryId: z.string(),
  recordedByUserId: z.string(),
});
export type ExpenseEntity = z.infer<typeof expenseEntitySchema>;

export const transferEntitySchema = tenantEntityBaseSchema.extend({
  fromAccountId: z.string(),
  toAccountId: z.string(),
  amountMinor: z.number().int().positive(),
  currency: currencySchema,
  date: isoDateSchema,
  note: z.string().max(200),
  journalEntryId: z.string(),
  recordedByUserId: z.string(),
});
export type TransferEntity = z.infer<typeof transferEntitySchema>;
