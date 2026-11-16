import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'travelta:onboarded';

/** Onboarding is shown once per install (local persistence; not a secret, so AsyncStorage is fine). */
export const useOnboarding = create<{ status: 'loading' | 'todo' | 'done'; load: () => Promise<void>; finish: () => Promise<void>; reset: () => Promise<void> }>()((set) => ({
  status: 'loading',
  load: async () => { set({ status: (await AsyncStorage.getItem(KEY).catch(() => null)) === '1' ? 'done' : 'todo' }); },
  finish: async () => { await AsyncStorage.setItem(KEY, '1').catch(() => undefined); set({ status: 'done' }); },
  reset: async () => { await AsyncStorage.removeItem(KEY).catch(() => undefined); set({ status: 'todo' }); },
}));
