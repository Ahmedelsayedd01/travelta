import { describe, expect, it } from 'vitest';
import { Database } from './database';

const row = (id: string, code: 'EGP' | 'USD' = 'EGP') => ({
  id, createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z', version: 1,
  code, name: { en: id, ar: id }, symbol: 'E£', exponent: 2, active: true,
});

describe('Database transactions', () => {
  it('commits writes when the work succeeds', async () => {
    const db = new Database();
    await db.transaction(() => {
      db.insert('currencies', row('cur_1'));
      db.nextSequence('invoice');
    });
    expect(db.count('currencies')).toBe(1);
    expect(db.nextSequence('invoice')).toBe(2);
  });

  it('rolls back inserts, replacements, deletes and sequences when the work throws', async () => {
    const db = new Database();
    db.insert('currencies', row('cur_keep'));
    db.insert('currencies', row('cur_del'));
    await expect(
      db.transaction(async () => {
        db.insert('currencies', row('cur_new'));
        db.replace('currencies', { ...row('cur_keep', 'USD'), version: 2 });
        db.delete('currencies', 'cur_del');
        db.nextSequence('invoice');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(db.get('currencies', 'cur_new')).toBeUndefined();
    expect(db.get('currencies', 'cur_keep')?.code).toBe('EGP');
    expect(db.get('currencies', 'cur_del')).toBeDefined();
    expect(db.nextSequence('invoice')).toBe(1);
  });

  it('never exposes stored objects by reference', () => {
    const db = new Database();
    db.insert('currencies', row('cur_1'));
    const read = db.get('currencies', 'cur_1')!;
    read.symbol = 'mutated';
    expect(db.get('currencies', 'cur_1')?.symbol).toBe('E£');
  });

  it('rejects duplicate ids', () => {
    const db = new Database();
    db.insert('currencies', row('cur_1'));
    expect(() => db.insert('currencies', row('cur_1'))).toThrow(/Duplicate/);
  });
});
