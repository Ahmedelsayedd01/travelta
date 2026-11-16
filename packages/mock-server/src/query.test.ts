import { describe, expect, it } from 'vitest';
import { listPage } from './query';

const rows = [
  { name: 'Cairo', ar: 'القاهرة', country: 'EG', rank: 3 },
  { name: 'Makkah', ar: 'مكة المكرمة', country: 'SA', rank: 1 },
  { name: 'Madinah', ar: 'المدينة المنورة', country: 'SA', rank: 2 },
  { name: 'Dubai', ar: 'دبي', country: 'AE', rank: 4 },
];
const spec = {
  search: (r: (typeof rows)[number]) => [r.name, r.ar],
  sortable: { name: (r: (typeof rows)[number]) => r.name, rank: (r: (typeof rows)[number]) => r.rank },
  filters: { country: (r: (typeof rows)[number], v: string[]) => v.includes(r.country) },
};

describe('listPage', () => {
  it('searches English and Arabic text', () => {
    expect(listPage(rows, { q: 'mad' }, spec).items.map((r) => r.name)).toEqual(['Madinah']);
    expect(listPage(rows, { q: 'مكة' }, spec).items.map((r) => r.name)).toEqual(['Makkah']);
  });

  it('filters, sorts and paginates', () => {
    const page = listPage(rows, { filters: { country: ['SA', 'AE'] }, sort: 'rank:desc', page: 1, pageSize: 2 }, spec);
    expect(page.items.map((r) => r.name)).toEqual(['Dubai', 'Madinah']);
    expect(page.total).toBe(3);
    expect(listPage(rows, { filters: { country: ['SA', 'AE'] }, sort: 'rank:desc', page: 2, pageSize: 2 }, spec).items.map((r) => r.name)).toEqual(['Makkah']);
  });

  it('clamps out-of-range pages', () => {
    expect(listPage(rows, { page: 99, pageSize: 3 }, spec).page).toBe(2);
  });
});
