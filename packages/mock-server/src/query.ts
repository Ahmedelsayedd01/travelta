import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type ListQuery, type Page } from '@travelta/contracts';

export interface ListSpec<T> {
  /** Text fields matched (case-insensitive, accent-insensitive for Latin) against `q`. */
  search?: (row: T) => (string | undefined | null)[];
  /** Sortable fields. Unknown sort keys are rejected by falling back to `defaultSort`. */
  sortable?: Record<string, (row: T) => string | number | null | undefined>;
  defaultSort?: `${string}:${'asc' | 'desc'}`;
  /** Filter handlers by key; values arrive as string or string[] from the query. */
  filters?: Record<string, (row: T, values: string[]) => boolean>;
}

const normalize = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Search → filter → sort → paginate, mirroring what the future API does server-side. */
export function listPage<T>(rows: T[], query: ListQuery, spec: ListSpec<T> = {}): Page<T> {
  let out = rows;

  const q = query.q?.trim();
  if (q && spec.search) {
    const needle = normalize(q);
    out = out.filter((row) => spec.search!(row).some((v) => v != null && normalize(v).includes(needle)));
  }

  for (const [key, raw] of Object.entries(query.filters ?? {})) {
    const handler = spec.filters?.[key];
    const values = (Array.isArray(raw) ? raw : [raw]).filter((v) => v !== '');
    if (handler && values.length > 0) out = out.filter((row) => handler(row, values));
  }

  const sort = query.sort ?? spec.defaultSort;
  if (sort && spec.sortable) {
    const [field, dir] = sort.split(':') as [string, 'asc' | 'desc'];
    const get = spec.sortable[field];
    if (get) {
      const factor = dir === 'desc' ? -1 : 1;
      out = [...out].sort((a, b) => {
        const av = get(a);
        const bv = get(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : av > bv ? 1 : 0) * factor;
      });
    }
  }

  const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const total = out.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(query.page ?? 1, 1), pages);
  return { items: out.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total };
}
