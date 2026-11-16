import type { DemoSnapshot, DemoStatus } from '@travelta/schemas';
import type { DemoClock } from './clock';
import type { Database } from './db/database';
import type { SimulationSettings, SupplierResponse } from './db/persistence';
import type { EventBus } from './events';
import type { Principal } from './security';

/**
 * Everything a handler may use. Built per call from the session token — never from client-supplied ids
 * (TENANCY_AND_SECURITY §2).
 */
export interface RequestContext {
  requestId: string;
  db: Database;
  clock: DemoClock;
  events: EventBus;
  /** The authenticated caller, or null for public operations without a token. */
  principal: Principal | null;
  /** Server internals for demo-only operations (reset/import/status). */
  admin: DemoAdmin;
  /**
   * Work that must survive a failed operation (e.g. counting a wrong one-time code before rejecting it): runs in
   * its own transaction after the operation's writes were rolled back. Optional so background jobs can omit it.
   */
  onRollback?: (fn: () => void) => void;
}

export interface DemoAdmin {
  status(): DemoStatus;
  reset(): Promise<void>;
  exportSnapshot(): DemoSnapshot;
  importSnapshot(snapshot: DemoSnapshot): Promise<void>;
  setClockOffsetDays(days: number): void;
  setSimulation(patch: Partial<SimulationSettings>): void;
  /** Consume the Demo panel's forced supplier response (returns 'auto' when none is set). */
  takeSupplierResponse(): SupplierResponse;
}
