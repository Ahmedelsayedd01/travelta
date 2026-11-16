/** Response envelopes shared by the mock transport today and the HTTP transport later (DATA_CONTRACTS §3). */
export interface ApiResult<T> {
  data: T;
  meta?: { requestId: string };
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type SortDirection = 'asc' | 'desc';

export interface ListQuery {
  page?: number;
  pageSize?: number;
  /** `field:asc` | `field:desc` */
  sort?: `${string}:${SortDirection}`;
  q?: string;
  filters?: Record<string, string | string[]>;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
