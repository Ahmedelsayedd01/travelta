/**
 * Prefixed, time-sortable identifiers (ULID-like: 10 chars time + 16 chars randomness, Crockford base32).
 * Generated client-side in the prototype; the future API will generate them server-side.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type Id<P extends string> = `${P}_${string}`;

export type RandomSource = () => number;

function encodeTime(ms: number): string {
  let out = '';
  let value = ms;
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[value % 32] + out;
    value = Math.floor(value / 32);
  }
  return out;
}

function encodeRandom(random: RandomSource): string {
  let out = '';
  for (let i = 0; i < 16; i++) out += ALPHABET[Math.floor(random() * 32)];
  return out;
}

export function createId<P extends string>(prefix: P, now: number = Date.now(), random: RandomSource = Math.random): Id<P> {
  return `${prefix}_${encodeTime(now)}${encodeRandom(random)}`;
}

export function idPrefix(id: string): string {
  const i = id.indexOf('_');
  return i === -1 ? '' : id.slice(0, i);
}
