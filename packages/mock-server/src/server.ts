import { isApiError } from '@travelta/contracts';
import { operations, type DemoSnapshot, type DemoStatus, type OperationInput, type OperationName, type OperationOutput } from '@travelta/schemas';
import { createId, hashString } from '@travelta/shared';
import { DemoClock } from './clock';
import type { DemoAdmin, RequestContext } from './context';
import { COLLECTION_NAMES, SCHEMA_VERSION, collectionSchemas, type CollectionName } from './db/collections';
import { Database, type DatabaseData } from './db/database';
import type { PersistenceAdapter, SimulationSettings } from './db/persistence';
import { ApiException, invalid } from './errors';
import { EventBus } from './events';
import { authHandlers } from './operations/auth';
import { demoHandlers } from './operations/demo';
import { referenceHandlers } from './operations/reference';
import { teamHandlers } from './operations/team';
import { organizationHandlers } from './operations/organizations';
import { kycHandlers } from './operations/kyc';
import { pricingHandlers } from './operations/pricing';
import { catalogHandlers } from './operations/catalog';
import { searchHandlers } from './operations/search';
import { bookingHandlers } from './operations/booking';
import { financeHandlers } from './operations/finance';
import { crmHandlers } from './operations/crm';
import { subscriptionHandlers } from './operations/subscriptions';
import { notificationHandlers } from './operations/notifications';
import { reportHandlers } from './operations/reports';
import { accountHandlers } from './operations/account';
import { storefrontHandlers } from './operations/storefront';
import { locationHandlers } from './operations/locations';
import { runClockJobs } from './jobs';
import type { Handler, HandlerMap } from './operations/types';
import { DEFAULT_SEED, buildSeed } from './seed';
import { resolvePrincipal } from './services/auth';
import { planGate } from './services/subscriptions';

export const handlers: HandlerMap = { ...demoHandlers, ...referenceHandlers, ...authHandlers, ...teamHandlers, ...organizationHandlers, ...kycHandlers, ...pricingHandlers, ...catalogHandlers, ...searchHandlers, ...bookingHandlers, ...financeHandlers, ...crmHandlers, ...subscriptionHandlers, ...notificationHandlers, ...reportHandlers, ...accountHandlers, ...storefrontHandlers, ...locationHandlers };

export interface MockServerOptions {
  persistence: PersistenceAdapter;
  seed?: number;
  /** Real-time source (tests inject a fixed clock). */
  realNow?: () => number;
  /** Initial simulation settings when nothing is persisted yet. */
  simulation?: Partial<SimulationSettings>;
  /** Debounce for persistence writes; 0 = write synchronously after each mutation (tests). */
  persistDebounceMs?: number;
  /** Validate outputs against the catalogue (dev/test). Inputs are always validated. */
  validateOutput?: boolean;
  /** Seed ~6 months of booking history (default true; unit tests start from the bare seed). */
  history?: boolean;
  /** Called when a stored dataset had an outdated schema and was reseeded. */
  onReseed?: (reason: string) => void;
}

const DEFAULT_SIMULATION: SimulationSettings = { latency: { minMs: 150, maxMs: 600 }, failureRate: 0 };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The simulated backend (MOCK_DATA_ARCHITECTURE §2). One instance per app process.
 * Call path: latency → serial queue → input validation → handler in a transaction → output validation → persist → events.
 */
export class MockServer {
  readonly events = new EventBus();
  private readonly db = new Database();
  private readonly clock: DemoClock;
  private readonly seed: number;
  private seededAt = new Date(0).toISOString();
  private settings: SimulationSettings;
  private queue: Promise<unknown> = Promise.resolve();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private booted: Promise<void> | null = null;

  constructor(private readonly options: MockServerOptions) {
    this.clock = new DemoClock(0, options.realNow);
    this.seed = options.seed ?? DEFAULT_SEED;
    this.settings = { ...DEFAULT_SIMULATION, ...options.simulation, latency: { ...DEFAULT_SIMULATION.latency, ...options.simulation?.latency } };
  }

  /** Load the persisted dataset or seed a fresh one. Safe to call repeatedly. */
  ready(): Promise<void> {
    this.booted ??= this.boot();
    return this.booted;
  }

  private async boot(): Promise<void> {
    const stored = await this.options.persistence.load();
    if (stored && stored.snapshot.schemaVersion === SCHEMA_VERSION) {
      this.applySnapshot(stored.snapshot);
      this.settings = stored.settings;
    } else {
      if (stored) this.options.onReseed?.(`Stored demo data uses schema v${stored.snapshot.schemaVersion}; current is v${SCHEMA_VERSION}.`);
      this.applySnapshot(buildSeed({ seed: this.seed, now: this.clock.now(), history: this.options.history }));
      await this.persistNow();
    }
    this.events.emit({ type: 'db.changed', operation: 'boot', at: this.clock.nowIso() });
  }

  /** Execute one operation as the future API would. Throws ApiException (or rejects with an ApiError-shaped error). */
  async handle<N extends OperationName>(name: N, input: OperationInput<N>, token?: string | null): Promise<OperationOutput<N>> {
    await this.ready();
    const def = operations[name];
    if (!def) throw new ApiException('NOT_FOUND', `Unknown operation ${String(name)}`);
    const requestId = createId('req', Date.now());

    if (!def.demoOnly) {
      const { minMs, maxMs } = this.settings.latency;
      const delay = minMs + Math.random() * Math.max(0, maxMs - minMs);
      if (delay > 0) await sleep(delay);
      if (this.settings.failureRate > 0 && Math.random() < this.settings.failureRate) {
        throw new ApiException('INTERNAL', 'Simulated network failure (Demo panel → failure rate)');
      }
    }

    const parsed = def.input.safeParse(input);
    if (!parsed.success) {
      throw invalid(parsed.error.issues.map((i) => ({ field: i.path.join('.') || undefined, issue: i.message })));
    }

    const run = async () => {
      // Time-based rules (document expiry, overdue instalments, …) run against the demo clock before every request.
      if (runClockJobs(this.db, this.clock)) this.schedulePersist();
      // Identity comes only from the token, resolved inside the queue so it sees committed state (TENANCY §2).
      const principal = resolvePrincipal(this.db, this.clock, token);
      if (def.auth === 'session' && !principal) throw new ApiException('UNAUTHENTICATED', 'Sign in required');
      // SUB-2/3: plan modules and the read-only state of a suspended subscription apply to every operation.
      planGate(this.db, this.clock, principal, name, def.http.method);
      const deferred: (() => void)[] = [];
      const ctx: RequestContext = { requestId, db: this.db, clock: this.clock, events: this.events, admin: this.admin, principal, onRollback: (fn) => deferred.push(fn) };
      const handler = handlers[name] as Handler<N>;
      const revision = this.db.revision;
      let output: OperationOutput<N>;
      try {
        output = await this.db.transaction(() => handler(ctx, parsed.data as never));
      } catch (error) {
        if (deferred.length > 0) {
          await this.db.transaction(() => { for (const fn of deferred) fn(); });
          this.schedulePersist();
        }
        throw error;
      }
      if (this.options.validateOutput) {
        const check = def.output.safeParse(output);
        if (!check.success) throw new ApiException('INTERNAL', `Output of ${name} violates its contract: ${check.error.message}`);
      }
      // Persist & notify other tabs only when something was written. POST reads (search, price simulation) must not
      // broadcast: every tab reloads and re-runs its own queries on a broadcast, which would ping-pong forever.
      // Demo-panel operations change settings/clock outside the tables, so their non-GET calls always count as writes.
      if (this.db.revision !== revision || (def.demoOnly && def.http.method !== 'GET')) {
        this.schedulePersist();
        this.events.emit({ type: 'db.changed', operation: name, at: this.clock.nowIso() });
      }
      return structuredClone(output) as OperationOutput<N>;
    };

    // Serialise operations so concurrent async handlers never interleave their writes/undo logs.
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    try {
      return await result;
    } catch (error) {
      if (error instanceof ApiException || isApiError(error)) throw error;
      console.error(`[mock-server] ${name} failed`, error);
      throw new ApiException('INTERNAL', error instanceof Error ? error.message : 'Unexpected error');
    }
  }

  /**
   * Re-read the persisted dataset (another browser tab wrote to IndexedDB). Waits for queued operations first.
   * Last writer wins between tabs — documented prototype limitation (MOCK_DATA_ARCHITECTURE §3).
   */
  async reload(): Promise<void> {
    await this.ready();
    await this.queue;
    const stored = await this.options.persistence.load();
    if (stored && stored.snapshot.schemaVersion === SCHEMA_VERSION) {
      this.applySnapshot(stored.snapshot);
      this.settings = stored.settings;
      this.events.emit({ type: 'db.changed', operation: 'import', at: this.clock.nowIso() });
    }
  }

  /** Write any pending changes immediately (call on page hide / app background). */
  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      await this.persistNow();
    }
  }

  // ---- internals -------------------------------------------------------------
  private readonly admin: DemoAdmin = {
    status: () => this.status(),
    reset: async () => {
      this.clock.setOffsetMs(0);
      this.applySnapshot(buildSeed({ seed: this.seed, now: this.clock.now(), history: this.options.history }));
      await this.persistNow();
      this.events.emit({ type: 'db.changed', operation: 'reset', at: this.clock.nowIso() });
    },
    exportSnapshot: () => this.snapshot(),
    importSnapshot: async (snapshot) => {
      this.validateSnapshot(snapshot);
      this.applySnapshot(snapshot);
      await this.persistNow();
      this.events.emit({ type: 'db.changed', operation: 'import', at: this.clock.nowIso() });
    },
    setClockOffsetDays: (days) => {
      this.clock.setOffsetDays(days);
      this.schedulePersist();
      this.events.emit({ type: 'clock.changed', at: this.clock.nowIso() });
    },
    setSimulation: (patch) => {
      this.settings = {
        latency: patch.latency ?? this.settings.latency, failureRate: patch.failureRate ?? this.settings.failureRate,
        nextSupplierResponse: patch.nextSupplierResponse ?? this.settings.nextSupplierResponse ?? 'auto',
      };
      this.schedulePersist();
    },
    takeSupplierResponse: () => {
      const next = this.settings.nextSupplierResponse ?? 'auto';
      if (next !== 'auto') {
        this.settings = { ...this.settings, nextSupplierResponse: 'auto' };
        this.schedulePersist();
      }
      return next;
    },
  };

  private status(): DemoStatus {
    const counts = this.db.counts();
    return {
      schemaVersion: SCHEMA_VERSION,
      seed: this.seed,
      seededAt: this.seededAt,
      now: this.clock.nowIso(),
      clockOffsetDays: Math.round(this.clock.offsetDays * 100) / 100,
      latency: this.settings.latency,
      failureRate: this.settings.failureRate,
      nextSupplierResponse: this.settings.nextSupplierResponse ?? 'auto',
      counts,
      fingerprint: this.fingerprint(),
    };
  }

  /** Content hash of the dataset (ignores the clock), used to prove reset/import round-trips are exact. */
  private fingerprint(): string {
    const data = this.db.dump();
    const ordered = COLLECTION_NAMES.map((n) => [n, [...data.collections[n]].sort((a, b) => (a.id < b.id ? -1 : 1))]);
    return hashString(JSON.stringify([ordered, Object.entries(data.sequences).sort()])).toString(16).padStart(8, '0');
  }

  private snapshot(): DemoSnapshot {
    const data = this.db.dump();
    return {
      format: 'travelta-demo',
      schemaVersion: SCHEMA_VERSION,
      seed: this.seed,
      seededAt: this.seededAt,
      clockOffsetMs: this.clock.offset,
      sequences: data.sequences,
      collections: data.collections as unknown as DemoSnapshot['collections'],
    };
  }

  private applySnapshot(snapshot: DemoSnapshot): void {
    this.db.load({ collections: snapshot.collections as unknown as DatabaseData['collections'], sequences: snapshot.sequences });
    this.seededAt = snapshot.seededAt;
    this.clock.setOffsetMs(snapshot.clockOffsetMs);
  }

  private validateSnapshot(snapshot: DemoSnapshot): void {
    if (snapshot.schemaVersion !== SCHEMA_VERSION) {
      throw invalid([{ field: 'schemaVersion', issue: 'validation.invalid_value' }], `Snapshot schema v${snapshot.schemaVersion} doesn't match v${SCHEMA_VERSION}`);
    }
    const issues: { field: string; issue: string }[] = [];
    for (const name of Object.keys(snapshot.collections)) {
      if (!(COLLECTION_NAMES as string[]).includes(name)) issues.push({ field: `collections.${name}`, issue: 'Unknown collection' });
    }
    for (const name of COLLECTION_NAMES) {
      const rows = snapshot.collections[name] ?? [];
      const schema = collectionSchemas[name as CollectionName];
      const ids = new Set<string>();
      rows.forEach((row, i) => {
        const r = schema.safeParse(row);
        if (!r.success) issues.push({ field: `collections.${name}[${i}]`, issue: r.error.issues[0]?.message ?? 'invalid' });
        const id = (row as { id?: string }).id ?? '';
        if (ids.has(id)) issues.push({ field: `collections.${name}[${i}].id`, issue: 'Duplicate id' });
        ids.add(id);
      });
    }
    if (issues.length === 0) issues.push(...referenceIssues(snapshot));
    if (issues.length > 0) throw invalid(issues.slice(0, 20), `Snapshot rejected: ${issues.length} problem(s)`);
  }

  private schedulePersist(): void {
    const debounce = this.options.persistDebounceMs ?? 300;
    if (debounce === 0) {
      void this.persistNow();
      return;
    }
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, debounce);
  }

  private async persistNow(): Promise<void> {
    try {
      await this.options.persistence.save({ snapshot: this.snapshot(), settings: this.settings });
    } catch (error) {
      console.error('[mock-server] persistence failed', error);
    }
  }
}

export const createMockServer = (options: MockServerOptions) => new MockServer(options);

/**
 * Referential integrity of an imported snapshot (the relationships the app relies on): every reference must point at an
 * existing row. Checked after the per-row schemas, so only well-formed data reaches here.
 */
function referenceIssues(snapshot: DemoSnapshot): { field: string; issue: string }[] {
  const ids = (name: string) => new Set((snapshot.collections[name] ?? []).map((r) => (r as { id: string }).id));
  const sets: Record<string, Set<string>> = {};
  const has = (name: string, id: unknown) => typeof id === 'string' && (sets[name] ??= ids(name)).has(id);
  // [collection, field, target collection, nullable]
  const RULES: [string, string, string, boolean][] = [
    ['memberships', 'userId', 'users', false], ['memberships', 'tenantId', 'organizations', false], ['memberships', 'roleId', 'roles', false],
    ['products', 'ownerTenantId', 'organizations', false], ['products', 'destinationId', 'destinations', false],
    ['places', 'destinationId', 'destinations', false], ['favorites', 'userId', 'users', false],
    ['bookings', 'tenantId', 'organizations', false], ['bookings', 'customerId', 'customers', true],
    ['bookingItems', 'bookingId', 'bookings', false], ['bookingItems', 'productId', 'products', true],
    ['payments', 'bookingId', 'bookings', true], ['invoices', 'bookingId', 'bookings', true],
    ['creditNotes', 'invoiceId', 'invoices', true], ['cancellations', 'bookingId', 'bookings', false],
    ['journalEntries', 'tenantId', 'organizations', false], ['wallets', 'tenantId', 'organizations', false],
    ['walletTransactions', 'walletId', 'wallets', false], ['customers', 'tenantId', 'organizations', false],
  ];
  const out: { field: string; issue: string }[] = [];
  for (const [collection, field, target, nullable] of RULES) {
    (snapshot.collections[collection] ?? []).forEach((row, i) => {
      const v = (row as Record<string, unknown>)[field];
      if (v === undefined || (nullable && v === null)) return;
      if (!has(target, v)) out.push({ field: `collections.${collection}[${i}].${field}`, issue: `References a missing ${target} row (${String(v)})` });
    });
  }
  // Ledger lines must point at accounts of the same tenant.
  const accounts = new Map((snapshot.collections.ledgerAccounts ?? []).map((a) => [(a as { id: string }).id, (a as { tenantId: string }).tenantId]));
  (snapshot.collections.journalEntries ?? []).forEach((row, i) => {
    const e = row as { tenantId: string; lines: { accountId: string }[] };
    for (const l of e.lines ?? []) if (accounts.get(l.accountId) !== e.tenantId) out.push({ field: `collections.journalEntries[${i}].lines`, issue: `Account ${l.accountId} is not in tenant ${e.tenantId}` });
  });
  return out;
}
