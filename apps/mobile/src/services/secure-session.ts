import * as SecureStore from 'expo-secure-store';

/**
 * The session token lives in the device keychain/keystore (Expo SecureStore) — never in AsyncStorage.
 * Only the opaque token is stored; user, organization and permissions are re-fetched (auth.me) on launch.
 */
const KEY = 'travelta.session.token';

export async function readToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch (error) {
    console.warn('[secure-session] read failed', error);
    return null;
  }
}

export async function writeToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
}

export async function deleteToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch (error) {
    console.warn('[secure-session] delete failed', error);
  }
}
