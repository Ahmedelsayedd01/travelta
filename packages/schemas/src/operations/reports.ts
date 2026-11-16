import { z } from 'zod';
import { currencySchema, isoDateSchema, localizedTextSchema } from '../primitives';
import { op } from './define';

// ---- Reports & analytics (W11, ACC-3) --------------------------------------------------------------------------------------
export const REPORT_KEYS = ['sales', 'bookings', 'profit', 'margins', 'ageing', 'payables', 'agencies', 'agents', 'suppliers'] as const;
export const reportKeySchema = z.enum(REPORT_KEYS);
export type ReportKey = z.infer<typeof reportKeySchema>;
/** Reports that show money owned by other parties or the ledger need `reports.view_financial`. */
export const FINANCIAL_REPORTS: readonly ReportKey[] = ['profit', 'margins', 'ageing', 'payables'];

export const rangeSchema = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() });

export const kpiSchema = z.object({
  key: z.string(),
  value: z.number(),
  kind: z.enum(['money', 'number', 'percent']),
  /** Change vs the previous period of the same length (percent), when meaningful. */
  deltaPct: z.number().nullable(),
  tone: z.enum(['neutral', 'good', 'warning', 'critical']).default('neutral'),
});
export type Kpi = z.infer<typeof kpiSchema>;
export const seriesPointSchema = z.object({ label: z.string(), value: z.number() });
export const chartSchema = z.object({ key: z.string(), kind: z.enum(['money', 'number']), points: z.array(seriesPointSchema) });
export type ChartData = z.infer<typeof chartSchema>;
export const dashboardSchema = z.object({
  audience: z.enum(['platform', 'agency', 'supplier']),
  currency: currencySchema,
  from: isoDateSchema,
  to: isoDateSchema,
  kpis: z.array(kpiSchema),
  /** Monthly trend (last 6 months, by month label YYYY-MM). */
  trend: chartSchema,
  /** Breakdown by service type (label = service type key). */
  byService: chartSchema,
  /** Top parties (customers, agencies or products) by value. */
  top: z.object({ key: z.string(), rows: z.array(z.object({ id: z.string(), name: z.string(), value: z.number(), count: z.number().int() })) }),
  attention: z.array(z.object({ key: z.string(), count: z.number().int(), link: z.string() })),
  /**
   * How the profit KPI is made (ledger lines dated in the window, ACC-3): revenue − cost of sales = gross profit;
   * − operating expenses by category = net profit. Cash movement is shown next to it because cash ≠ profit.
   * Null without reports.view_financial.
   */
  profitBreakdown: z.object({
    revenueMinor: z.number().int(),
    revenueByAccount: z.array(z.object({ name: localizedTextSchema, amountMinor: z.number().int() })),
    costOfSalesMinor: z.number().int(),
    grossProfitMinor: z.number().int(),
    operatingExpensesMinor: z.number().int(),
    expensesByAccount: z.array(z.object({ name: localizedTextSchema, amountMinor: z.number().int() })),
    netProfitMinor: z.number().int(),
    cashChangeMinor: z.number().int(),
    journalEntries: z.number().int(),
  }).nullable(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const reportColumnSchema = z.object({ key: z.string(), type: z.enum(['text', 'money', 'number', 'percent', 'date']) });
export const reportSchema = z.object({
  key: reportKeySchema,
  currency: currencySchema,
  from: isoDateSchema.nullable(),
  to: isoDateSchema.nullable(),
  columns: z.array(reportColumnSchema),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  totals: z.record(z.string(), z.number()),
  /** Rows that link somewhere (e.g. a booking) carry an app path. */
  links: z.array(z.string().nullable()),
  title: localizedTextSchema.optional(),
});
export type Report = z.infer<typeof reportSchema>;

export const reportOperations = {
  'reports.dashboard': op({ input: rangeSchema.default({}), output: dashboardSchema, http: { method: 'GET', path: '/reports/dashboard' }, auth: 'session' }),
  'reports.available': op({ input: z.void(), output: z.array(reportKeySchema), http: { method: 'GET', path: '/reports' }, auth: 'session' }),
  'reports.run': op({ input: rangeSchema.extend({ report: reportKeySchema }), output: reportSchema, http: { method: 'GET', path: '/reports/:report' }, auth: 'session' }),
} as const;
