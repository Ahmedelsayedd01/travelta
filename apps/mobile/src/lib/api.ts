import { createMockApi, type MockApi } from '@travelta/api-client/mock';
import { asyncStoragePersistence } from '@/services/persistence';
import { useSession } from '@/store/session';

let instance: MockApi | null = null;

/** The prototype backend for this device. Replace with an HTTP-backed client when the NestJS API exists. */
export function getMockApi(): MockApi {
  instance ??= createMockApi({
    persistence: asyncStoragePersistence(),
    getToken: () => useSession.getState().token,
    validateOutput: __DEV__,
  });
  return instance;
}
