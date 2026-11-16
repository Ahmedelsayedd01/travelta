import { z } from 'zod';
import { currencySchema, isoDateSchema, isoDateTimeSchema, listQuerySchema, localizedTextSchema, minorAmountSchema } from '../primitives';
import { paymentTypeSchema } from '../enums';
import {
  cancellationEntitySchema, creditNoteEntitySchema, EXPENSE_CATEGORIES, expenseEntitySchema, FINANCIAL_ACCOUNT_KINDS, financialAccountEntitySchema,
  installmentSchema, invoiceEntitySchema, journalEntryEntitySchema, ledgerAccountEntitySchema, ledgerAccountTypeSchema, paymentAllocationSchema,
  paymentEntitySchema, paymentPlanEntitySchema, supplierPayableEntitySchema, topUpRequestEntitySchema, transferEntitySchema, walletEntitySchema,
  walletHoldEntitySchema, walletTransactionEntitySchema,
} from '../entities/finance';
import { kycFileSchema } from '../entities/kyc';
import { bookingDtoSchema, installmentInputSchema } from './booking';
import { op } from './define';
import { pageOf } from './reference';

const positive = z.number({ error: 'validation.required' }).int({ error: 'validation.must_be_integer' }).positive({ error: 'validation.must_be_positive' });
const reasonText = z.string().trim().min(3, { error: 'validation.too_short' }).max(300);

// ---- Payments (PAY, W6) ---------------------------------------------------------------------------------------------
export const collectPaymentInputSchema = z.object({
  bookingId: z.string(),
  amountMinor: positive,
  /** PAY-3: split across financial accounts; must sum to the amount. */
  allocations: z.array(paymentAllocationSchema).min(1, { error: 'validation.required' }).max(5),
  /** PAY-4: optional instalment to pay first. */
  installmentSeq: z.number().int().min(1).optional(),
  reference: z.string().trim().max(80).default(''),
  note: z.string().trim().max(500).default(''),
});
export type CollectPaymentInput = z.input<typeof collectPaymentInputSchema>;

export const paymentListItemSchema = paymentEntitySchema.extend({
  bookingRef: z.string().nullable(), customerName: z.string().nullable(), accountNames: z.array(z.string()), recordedByName: z.string().nullable(),
});
export const overdueRowSchema = z.object({
  bookingId: z.string(), ref: z.string(), customerName: z.string().nullable(), sellerName: z.string(), seq: z.number().int(), installments: z.number().int(),
  amountMinor: minorAmountSchema, paidMinor: minorAmountSchema, dueDate: isoDateSchema, daysOverdue: z.number().int(),
  status: installmentSchema.shape.status, currency: currencySchema, bucket: z.enum(['due_soon', 'd0_30', 'd31_60', 'd61_90', 'd90_plus']), remindedAt: isoDateTimeSchema.nullable(),
});
export type OverdueRow = z.infer<typeof overdueRowSchema>;

export const updatePlanInputSchema = z.object({ bookingId: z.string(), type: paymentTypeSchema, installments: z.array(installmentInputSchema).max(12).default([]) });

export const bookingFinanceSchema = z.object({
  bookingId: z.string(),
  currency: currencySchema,
  /** What the customer owes now: active items + retained cancellation fees. */
  dueMinor: minorAmountSchema,
  paidMinor: minorAmountSchema,
  refundedMinor: minorAmountSchema,
  outstandingMinor: minorAmountSchema,
  authorizedMinor: minorAmountSchema,
  plan: paymentPlanEntitySchema.nullable(),
  payments: z.array(paymentListItemSchema),
  invoice: invoiceEntitySchema.nullable(),
  creditNotes: z.array(creditNoteEntitySchema),
  cancellations: z.array(cancellationEntitySchema.extend({ itemTitle: localizedTextSchema, requestedByName: z.string() })),
  holds: z.array(walletHoldEntitySchema.extend({ walletOwnerName: z.string() })),
  canCollect: z.boolean(),
  canEditPlan: z.boolean(),
});
export type BookingFinance = z.infer<typeof bookingFinanceSchema>;

// ---- Financial accounts -----------------------------------------------------------------------------------------------
export const financialAccountDtoSchema = financialAccountEntitySchema.extend({ balanceMinor: minorAmountSchema, ledgerCode: z.string() });
export type FinancialAccountDto = z.infer<typeof financialAccountDtoSchema>;
export const saveFinancialAccountInputSchema = z.object({
  id: z.string().optional(), kind: z.enum(FINANCIAL_ACCOUNT_KINDS), name: z.string().trim().min(2, { error: 'validation.too_short' }).max(80), active: z.boolean().default(true),
});

// ---- Wallet (WAL, W8) -----------------------------------------------------------------------------------------------
export const walletDtoSchema = walletEntitySchema.extend({
  ownerName: z.string(), holderName: z.string(), availableMinor: minorAmountSchema, creditUsedMinor: minorAmountSchema, activeHoldsMinor: minorAmountSchema,
  awaitingMinor: minorAmountSchema, pendingTopUps: z.number().int(),
  /** WAL-6 integrity: the cached balance equals the sum of transactions. */
  balanceVerified: z.boolean(),
});
export type WalletDto = z.infer<typeof walletDtoSchema>;
export const walletDetailSchema = z.object({
  wallet: walletDtoSchema,
  holds: z.array(walletHoldEntitySchema.extend({ bookingRef: z.string(), itemTitle: localizedTextSchema })),
  canManageCredit: z.boolean(),
  canApproveTopUps: z.boolean(),
  canRequestTopUp: z.boolean(),
});
export type WalletDetail = z.infer<typeof walletDetailSchema>;
export const topUpListItemSchema = topUpRequestEntitySchema.extend({ ownerName: z.string(), requestedByName: z.string(), decidedByName: z.string().nullable(), canDecide: z.boolean(), currency: currencySchema });
export type TopUpListItem = z.infer<typeof topUpListItemSchema>;
export const requestTopUpInputSchema = z.object({
  amountMinor: positive, method: topUpRequestEntitySchema.shape.method, reference: z.string().trim().min(2, { error: 'validation.required' }).max(80), proof: kycFileSchema.nullable().default(null),
  /** Sub-agencies top up at their parent; agencies at the platform. */
  walletId: z.string().optional(),
});

// ---- Invoices & cancellations (INV, CAN, W7) ---------------------------------------------------------------------------
export const invoiceListItemSchema = invoiceEntitySchema.extend({ bookingRef: z.string(), sellerName: z.string() });
export const invoiceDtoSchema = invoiceEntitySchema.extend({
  bookingRef: z.string(), seller: z.object({ name: z.string(), legalName: z.string(), city: z.string(), country: z.string() }),
  creditNotes: z.array(creditNoteEntitySchema), payments: z.array(paymentListItemSchema), canEdit: z.boolean(), dueMinor: minorAmountSchema,
});
export type InvoiceDto = z.infer<typeof invoiceDtoSchema>;
export const updateInvoiceInputSchema = z.object({
  id: z.string(), discountMinor: z.number().int().min(0, { error: 'validation.must_be_positive' }), extraFeesMinor: z.number().int().min(0, { error: 'validation.must_be_positive' }), notes: z.string().max(1000).default(''),
});

export const REFUND_METHODS = ['wallet', 'card', 'cash', 'bank_transfer', 'none'] as const;
export const cancellationQuoteSchema = z.object({
  daysBefore: z.number().int(), status: z.enum(['pending', 'confirmed', 'vouchered']), sellMinor: minorAmountSchema,
  customerFeeMinor: minorAmountSchema, adminFeeMinor: minorAmountSchema, retainedMinor: minorAmountSchema, creditMinor: minorAmountSchema,
  refundMinor: minorAmountSchema, refundMethods: z.array(z.enum(REFUND_METHODS)), defaultRefundMethod: z.enum(REFUND_METHODS),
  /** CAN-4: a refund requested without payments.refund_approve waits for approval. */
  needsApproval: z.boolean(), currency: currencySchema, viaAdapter: z.boolean(),
});
export type CancellationQuoteDto = z.infer<typeof cancellationQuoteSchema>;
export const cancellationListItemSchema = cancellationEntitySchema.extend({
  bookingRef: z.string(), itemTitle: localizedTextSchema, requestedByName: z.string(), currency: currencySchema, canDecide: z.boolean(), canRetry: z.boolean(), sellerName: z.string(),
});

// ---- Accounting (ACC) ------------------------------------------------------------------------------------------------
export const ledgerAccountDtoSchema = ledgerAccountEntitySchema.extend({ debitMinor: minorAmountSchema, creditMinor: minorAmountSchema, balanceMinor: minorAmountSchema });
export type LedgerAccountDto = z.infer<typeof ledgerAccountDtoSchema>;
export const journalEntryDtoSchema = journalEntryEntitySchema.extend({
  lines: z.array(journalEntryEntitySchema.shape.lines.element.extend({ accountCode: z.string(), accountName: localizedTextSchema })),
  totalMinor: minorAmountSchema, postedByName: z.string(), bookingRef: z.string().nullable(), reversedBy: z.string().nullable(),
});
export type JournalEntryDto = z.infer<typeof journalEntryDtoSchema>;
export const trialBalanceSchema = z.object({
  currency: currencySchema, from: isoDateSchema.nullable(), to: isoDateSchema.nullable(),
  rows: z.array(ledgerAccountDtoSchema), totalDebitMinor: minorAmountSchema, totalCreditMinor: minorAmountSchema,
  revenueMinor: minorAmountSchema, expenseMinor: minorAmountSchema, profitMinor: minorAmountSchema,
});
export type TrialBalance = z.infer<typeof trialBalanceSchema>;
export const manualEntryInputSchema = z.object({
  date: isoDateSchema, memo: z.string().trim().min(3, { error: 'validation.too_short' }).max(300),
  lines: z.array(z.object({ accountId: z.string().min(1, { error: 'validation.required' }), debitMinor: z.number().int().min(0), creditMinor: z.number().int().min(0) })).min(2).max(10),
});
export const saveLedgerAccountInputSchema = z.object({
  id: z.string().optional(), code: z.string().trim().regex(/^\d{3,6}$/, { error: 'validation.invalid_value' }), name: localizedTextSchema, type: ledgerAccountTypeSchema, active: z.boolean().default(true),
});
export const expenseInputSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES), description: z.string().trim().min(2, { error: 'validation.too_short' }).max(200), amountMinor: positive, financialAccountId: z.string().min(1, { error: 'validation.required' }), date: isoDateSchema,
});
export const transferInputSchema = z.object({
  fromAccountId: z.string().min(1, { error: 'validation.required' }), toAccountId: z.string().min(1, { error: 'validation.required' }), amountMinor: positive, date: isoDateSchema, note: z.string().max(200).default(''),
}).refine((t) => t.fromAccountId !== t.toAccountId, { error: 'validation.same_account', path: ['toAccountId'] });
export const expenseListItemSchema = expenseEntitySchema.extend({ accountName: z.string(), recordedByName: z.string() });
export const transferListItemSchema = transferEntitySchema.extend({ fromName: z.string(), toName: z.string() });
export const ageingRowSchema = z.object({
  customerId: z.string().nullable(), customerName: z.string(), currentMinor: minorAmountSchema, d0_30Minor: minorAmountSchema, d31_60Minor: minorAmountSchema,
  d61_90Minor: minorAmountSchema, d90PlusMinor: minorAmountSchema, totalMinor: minorAmountSchema,
});

// ---- Supplier payables & payouts (SUP-3) -----------------------------------------------------------------------------
export const payableListItemSchema = supplierPayableEntitySchema.extend({
  bookingRef: z.string(), itemTitle: localizedTextSchema, payerName: z.string(), overdue: z.boolean(), canPay: z.boolean(), serviceDate: isoDateSchema,
});
export type PayableListItem = z.infer<typeof payableListItemSchema>;

export type PaymentListItem = z.infer<typeof paymentListItemSchema>;
export type CancellationListItem = z.infer<typeof cancellationListItemSchema>;
export type InvoiceListItem = z.infer<typeof invoiceListItemSchema>;
export type ExpenseListItem = z.infer<typeof expenseListItemSchema>;
export type TransferListItem = z.infer<typeof transferListItemSchema>;
export type AgeingRow = z.infer<typeof ageingRowSchema>;

const query = listQuerySchema;
const ok = z.object({ ok: z.literal(true) });

export const financeOperations = {
  'payments.list': op({ input: query, output: pageOf(paymentListItemSchema), http: { method: 'GET', path: '/payments' }, auth: 'session' }),
  'payments.collect': op({ input: collectPaymentInputSchema, output: bookingFinanceSchema, http: { method: 'POST', path: '/bookings/:bookingId/payments' }, auth: 'session' }),
  'payments.overdue': op({ input: query, output: pageOf(overdueRowSchema), http: { method: 'GET', path: '/payments/overdue' }, auth: 'session' }),
  'payments.remind': op({ input: z.object({ bookingId: z.string(), seq: z.number().int() }), output: ok, http: { method: 'POST', path: '/bookings/:bookingId/installments/:seq/remind' }, auth: 'session' }),
  'payments.updatePlan': op({ input: updatePlanInputSchema, output: bookingFinanceSchema, http: { method: 'PUT', path: '/bookings/:bookingId/plan' }, auth: 'session' }),
  'bookings.finance': op({ input: z.object({ bookingId: z.string() }), output: bookingFinanceSchema, http: { method: 'GET', path: '/bookings/:bookingId/finance' }, auth: 'session' }),

  'finance.accounts': op({ input: z.void(), output: z.array(financialAccountDtoSchema), http: { method: 'GET', path: '/finance/accounts' }, auth: 'session' }),
  'finance.saveAccount': op({ input: saveFinancialAccountInputSchema, output: financialAccountDtoSchema, http: { method: 'POST', path: '/finance/accounts' }, auth: 'session' }),

  'wallet.get': op({ input: z.object({ walletId: z.string().optional() }).default({}), output: walletDetailSchema, http: { method: 'GET', path: '/wallets/:walletId' }, auth: 'session' }),
  'wallet.list': op({ input: query, output: pageOf(walletDtoSchema), http: { method: 'GET', path: '/wallets' }, auth: 'session' }),
  'wallet.transactions': op({ input: query.extend({ walletId: z.string().optional() }), output: pageOf(walletTransactionEntitySchema), http: { method: 'GET', path: '/wallets/:walletId/transactions' }, auth: 'session' }),
  'wallet.requestTopUp': op({ input: requestTopUpInputSchema, output: topUpRequestEntitySchema, http: { method: 'POST', path: '/wallets/top-ups' }, auth: 'session' }),
  'wallet.topUps': op({ input: query, output: pageOf(topUpListItemSchema), http: { method: 'GET', path: '/wallets/top-ups' }, auth: 'session' }),
  'wallet.decideTopUp': op({ input: z.object({ id: z.string(), decision: z.enum(['approve', 'reject']), reason: z.string().max(300).optional(), financialAccountId: z.string().optional() }), output: topUpListItemSchema, http: { method: 'POST', path: '/wallets/top-ups/:id/decision' }, auth: 'session' }),
  'wallet.setCreditLimit': op({ input: z.object({ walletId: z.string(), creditLimitMinor: z.number().int().min(0, { error: 'validation.must_be_positive' }) }), output: walletDtoSchema, http: { method: 'PUT', path: '/wallets/:walletId/credit-limit' }, auth: 'session' }),
  'wallet.setStatus': op({ input: z.object({ walletId: z.string(), status: walletEntitySchema.shape.status }), output: walletDtoSchema, http: { method: 'PUT', path: '/wallets/:walletId/status' }, auth: 'session' }),
  'wallet.approveCredit': op({ input: z.object({ bookingId: z.string(), itemId: z.string() }), output: bookingDtoSchema, http: { method: 'POST', path: '/bookings/:bookingId/items/:itemId/approve-credit' }, auth: 'session' }),

  'invoices.list': op({ input: query, output: pageOf(invoiceListItemSchema), http: { method: 'GET', path: '/invoices' }, auth: 'session' }),
  'invoices.get': op({ input: z.object({ id: z.string() }), output: invoiceDtoSchema, http: { method: 'GET', path: '/invoices/:id' }, auth: 'session' }),
  'invoices.update': op({ input: updateInvoiceInputSchema, output: invoiceDtoSchema, http: { method: 'PATCH', path: '/invoices/:id' }, auth: 'session' }),

  'cancellations.quote': op({ input: z.object({ bookingId: z.string(), itemId: z.string() }), output: cancellationQuoteSchema, http: { method: 'GET', path: '/bookings/:bookingId/items/:itemId/cancellation-quote' }, auth: 'session' }),
  'cancellations.request': op({ input: z.object({ bookingId: z.string(), itemId: z.string(), reason: reasonText, refundMethod: z.enum(REFUND_METHODS) }), output: bookingDtoSchema, http: { method: 'POST', path: '/bookings/:bookingId/items/:itemId/cancel' }, auth: 'session' }),
  'cancellations.list': op({ input: query, output: pageOf(cancellationListItemSchema), http: { method: 'GET', path: '/cancellations' }, auth: 'session' }),
  'cancellations.decide': op({ input: z.object({ id: z.string(), decision: z.enum(['approve', 'reject']), reason: z.string().max(300).optional() }), output: cancellationListItemSchema, http: { method: 'POST', path: '/cancellations/:id/decision' }, auth: 'session' }),
  'cancellations.retry': op({ input: z.object({ id: z.string() }), output: cancellationListItemSchema, http: { method: 'POST', path: '/cancellations/:id/retry' }, auth: 'session' }),

  'accounting.chart': op({ input: z.void(), output: z.array(ledgerAccountDtoSchema), http: { method: 'GET', path: '/accounting/accounts' }, auth: 'session' }),
  'accounting.saveAccount': op({ input: saveLedgerAccountInputSchema, output: ledgerAccountDtoSchema, http: { method: 'POST', path: '/accounting/accounts' }, auth: 'session' }),
  'accounting.journal': op({ input: query, output: pageOf(journalEntryDtoSchema), http: { method: 'GET', path: '/accounting/journal' }, auth: 'session' }),
  'accounting.trialBalance': op({ input: z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() }).default({}), output: trialBalanceSchema, http: { method: 'GET', path: '/accounting/trial-balance' }, auth: 'session' }),
  'accounting.postManual': op({ input: manualEntryInputSchema, output: journalEntryDtoSchema, http: { method: 'POST', path: '/accounting/journal' }, auth: 'session' }),
  'accounting.reverse': op({ input: z.object({ entryId: z.string(), memo: reasonText }), output: journalEntryDtoSchema, http: { method: 'POST', path: '/accounting/journal/:entryId/reverse' }, auth: 'session' }),
  'accounting.expenses': op({ input: query, output: pageOf(expenseListItemSchema), http: { method: 'GET', path: '/accounting/expenses' }, auth: 'session' }),
  'accounting.recordExpense': op({ input: expenseInputSchema, output: expenseListItemSchema, http: { method: 'POST', path: '/accounting/expenses' }, auth: 'session' }),
  'accounting.transfers': op({ input: query, output: pageOf(transferListItemSchema), http: { method: 'GET', path: '/accounting/transfers' }, auth: 'session' }),
  'accounting.transfer': op({ input: transferInputSchema, output: transferListItemSchema, http: { method: 'POST', path: '/accounting/transfers' }, auth: 'session' }),
  'accounting.ageing': op({ input: z.void(), output: z.array(ageingRowSchema), http: { method: 'GET', path: '/accounting/receivables-ageing' }, auth: 'session' }),

  'payables.list': op({ input: query, output: pageOf(payableListItemSchema), http: { method: 'GET', path: '/payables' }, auth: 'session' }),
  'payables.pay': op({ input: z.object({ id: z.string(), amountMinor: positive, financialAccountId: z.string().min(1, { error: 'validation.required' }), reference: z.string().max(80).default('') }), output: payableListItemSchema, http: { method: 'POST', path: '/payables/:id/payments' }, auth: 'session' }),
} as const;
