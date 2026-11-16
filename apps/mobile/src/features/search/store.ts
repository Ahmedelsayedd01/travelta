import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SearchInput, SearchResult } from '@travelta/schemas';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface RecentSearch { serviceType: SearchInput['serviceType']; destinationCode: string; from: string; at: string }
export interface ResultFilters { sort: 'price_asc' | 'price_desc' | 'rating' | 'distance'; refundable: boolean }

/**
 * The last search, its list filters (shared by list and map so switching views keeps them), the opened product and
 * recent searches (persisted on the device for the Home screen).
 */
export const useSearchState = create<{
  input: SearchInput | null; selected: SearchResult | null; filters: ResultFilters; recent: RecentSearch[];
  setInput: (i: SearchInput, recent?: Omit<RecentSearch, 'at'>) => void; select: (r: SearchResult) => void; setFilters: (f: Partial<ResultFilters>) => void;
}>()(persist((set) => ({
  input: null, selected: null, filters: { sort: 'price_asc', refundable: false }, recent: [],
  setInput: (input, recent) => set((s) => ({
    input, filters: { sort: 'price_asc', refundable: false },
    recent: recent ? [{ ...recent, at: new Date().toISOString() }, ...s.recent.filter((r) => !(r.serviceType === recent.serviceType && r.destinationCode === recent.destinationCode))].slice(0, 6) : s.recent,
  })),
  select: (selected) => set({ selected }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
}), { name: 'travelta:search', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ recent: s.recent }) }));
