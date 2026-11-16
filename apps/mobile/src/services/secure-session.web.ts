/**
 * Expo Web only. `expo-secure-store` has no web implementation (its web module is empty), so the browser build keeps
 * the opaque session token in localStorage — the same trade-off as the Next.js prototype. This is weaker than the
 * native keychain/keystore used on iOS/Android (see secure-session.ts) and is acceptable only for the prototype.
 */
const KEY = 'travelta.session.token';

export async function readToken(): Promise<string | null> {
  try { return globalThis.localStorage?.getItem(KEY) ?? null; } catch { return null; }
}

export async function writeToken(token: string): Promise<void> {
  try { globalThis.localStorage?.setItem(KEY, token); } catch { /* storage blocked: session lasts for this tab only */ }
}

export async function deleteToken(): Promise<void> {
  try { globalThis.localStorage?.removeItem(KEY); } catch { /* ignore */ }
}
