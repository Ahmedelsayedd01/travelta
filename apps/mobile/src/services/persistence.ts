import AsyncStorage from '@react-native-async-storage/async-storage';
import { createKeyValuePersistence, type PersistenceAdapter } from '@travelta/api-client/mock';

/** Mobile persistence for the mock backend: chunked AsyncStorage (logic and tests live in @travelta/api-client). */
export function asyncStoragePersistence(): PersistenceAdapter {
  return createKeyValuePersistence(AsyncStorage);
}
