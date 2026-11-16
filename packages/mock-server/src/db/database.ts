import { COLLECTION_NAMES, type CollectionName, type Collections } from './collections';

type Store = { [K in CollectionName]: Map<string, Collections[K]> };

export interface DatabaseData {
  collections: { [K in CollectionName]: Collections[K][] };
  sequences: Record<string, number>;
}

const emptyStore = (): Store =>
  Object.fromEntries(COLLECTION_NAMES.map((name) => [name, new Map()])) as unknown as Store;

/**
 * In-memory tables with an undo log. `transaction()` makes multi-entity writes atomic:
 * if the work throws, every write made inside it is reverted (MOCK_DATA_ARCHITECTURE §2).
 * Stored objects are never handed out directly — reads return structured clones.
 */
export class Database {
  private store: Store = emptyStore();
  private sequences: Record<string, number> = {};
  private undo: (() => void)[] | null = null;
  private committedWrites = 0;

  /** Grows with every committed write; lets callers tell read-only requests (search, simulate) from mutations. */
  get revision(): number {
    return this.committedWrites;
  }

  // ---- reads ---------------------------------------------------------------
  get<K extends CollectionName>(collection: K, id: string): Collections[K] | undefined {
    const row = this.store[collection].get(id);
    return row ? structuredClone(row) : undefined;
  }

  all<K extends CollectionName>(collection: K): Collections[K][] {
    return [...this.store[collection].values()].map((row) => structuredClone(row));
  }

  find<K extends CollectionName>(collection: K, predicate: (row: Collections[K]) => boolean): Collections[K] | undefined {
    for (const row of this.store[collection].values()) if (predicate(row)) return structuredClone(row);
    return undefined;
  }

  filter<K extends CollectionName>(collection: K, predicate: (row: Collections[K]) => boolean): Collections[K][] {
    const out: Collections[K][] = [];
    for (const row of this.store[collection].values()) if (predicate(row)) out.push(structuredClone(row));
    return out;
  }

  count(collection: CollectionName): number {
    return this.store[collection].size;
  }

  // ---- writes --------------------------------------------------------------
  insert<K extends CollectionName>(collection: K, row: Collections[K]): Collections[K] {
    const table = this.store[collection];
    if (table.has(row.id)) throw new Error(`Duplicate id ${row.id} in ${collection}`);
    table.set(row.id, structuredClone(row));
    this.undo?.push(() => table.delete(row.id));
    return structuredClone(row);
  }

  /** Replace an existing row (callers bump `version`/`updatedAt` through repositories). */
  replace<K extends CollectionName>(collection: K, row: Collections[K]): Collections[K] {
    const table = this.store[collection];
    const previous = table.get(row.id);
    if (!previous) throw new Error(`Missing id ${row.id} in ${collection}`);
    table.set(row.id, structuredClone(row));
    this.undo?.push(() => table.set(row.id, previous));
    return structuredClone(row);
  }

  delete(collection: CollectionName, id: string): boolean {
    const table = this.store[collection] as Map<string, unknown>;
    const previous = table.get(id);
    if (previous === undefined) return false;
    table.delete(id);
    this.undo?.push(() => table.set(id, previous));
    return true;
  }

  /** Per-tenant/per-purpose counters (invoice numbers, booking refs). Rolled back with the transaction. */
  nextSequence(name: string): number {
    const previous = this.sequences[name];
    const next = (previous ?? 0) + 1;
    this.sequences[name] = next;
    this.undo?.push(() => {
      if (previous === undefined) delete this.sequences[name];
      else this.sequences[name] = previous;
    });
    return next;
  }

  // ---- transactions --------------------------------------------------------
  async transaction<T>(work: () => Promise<T> | T): Promise<T> {
    if (this.undo) return work(); // nested: join the outer transaction
    this.undo = [];
    try {
      const result = await work();
      this.committedWrites += this.undo.length;
      this.undo = null;
      return result;
    } catch (error) {
      const log = this.undo ?? [];
      this.undo = null;
      for (let i = log.length - 1; i >= 0; i--) log[i]?.();
      throw error;
    }
  }

  // ---- snapshot ------------------------------------------------------------
  dump(): DatabaseData {
    const collections = Object.fromEntries(
      COLLECTION_NAMES.map((name) => [name, [...this.store[name].values()].map((r) => structuredClone(r))]),
    ) as DatabaseData['collections'];
    return { collections, sequences: { ...this.sequences } };
  }

  load(data: DatabaseData): void {
    const store = emptyStore();
    for (const name of COLLECTION_NAMES) {
      const table = store[name] as Map<string, { id: string }>;
      for (const row of (data.collections[name] ?? []) as { id: string }[]) table.set(row.id, structuredClone(row));
    }
    this.store = store;
    this.sequences = { ...data.sequences };
  }

  counts(): Record<CollectionName, number> {
    return Object.fromEntries(COLLECTION_NAMES.map((n) => [n, this.store[n].size])) as Record<CollectionName, number>;
  }
}
