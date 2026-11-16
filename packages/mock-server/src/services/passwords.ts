import { hashString } from '@travelta/shared';

/**
 * SIMULATION ONLY (TENANCY_AND_SECURITY §7): a non-cryptographic salted hash so the prototype never stores
 * plain-text passwords in the demo dataset. Production uses argon2/bcrypt inside the NestJS auth module.
 */
export function simHash(password: string, salt: string): string {
  const a = hashString(`${salt}:${password}`).toString(16).padStart(8, '0');
  const b = hashString(`${password}:${salt}:${a}`).toString(16).padStart(8, '0');
  return `sim1$${salt}$${a}${b}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [, salt] = stored.split('$');
  return salt !== undefined && simHash(password, salt) === stored;
}
