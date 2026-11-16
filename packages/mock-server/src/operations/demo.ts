import type { HandlerMap } from './types';

export const demoHandlers: HandlerMap<'demo.status' | 'demo.reset' | 'demo.export' | 'demo.import' | 'demo.setClock' | 'demo.setSimulation'> = {
  'demo.status': (ctx) => ctx.admin.status(),
  'demo.reset': async (ctx) => {
    await ctx.admin.reset();
    return ctx.admin.status();
  },
  'demo.export': (ctx) => ({ ...ctx.admin.exportSnapshot(), exportedAt: ctx.clock.nowIso() }),
  'demo.import': async (ctx, snapshot) => {
    await ctx.admin.importSnapshot(snapshot);
    return ctx.admin.status();
  },
  'demo.setClock': (ctx, { offsetDays }) => {
    ctx.admin.setClockOffsetDays(offsetDays);
    return ctx.admin.status();
  },
  'demo.setSimulation': (ctx, patch) => {
    ctx.admin.setSimulation(patch);
    return ctx.admin.status();
  },
};
