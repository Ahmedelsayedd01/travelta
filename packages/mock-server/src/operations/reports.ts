import { requirePrincipal } from '../security';
import { availableReports, dashboard, runReport } from '../services/reports';
import type { HandlerMap } from './types';

export const reportHandlers: HandlerMap<'reports.dashboard' | 'reports.available' | 'reports.run'> = {
  'reports.dashboard': (ctx, range = {}) => dashboard(ctx, requirePrincipal(ctx), range),
  'reports.available': (ctx) => availableReports(requirePrincipal(ctx)),
  'reports.run': (ctx, { report, ...range }) => runReport(ctx, requirePrincipal(ctx), report, range),
};
