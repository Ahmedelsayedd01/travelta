import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FavoriteInput, SearchResult } from '@travelta/schemas';
import { useApi } from '@/lib/api-provider';
import { useSession } from '@/store/session';

/** Saved products of the signed-in customer (shared with the web account — same server operations). */
export function useFavorites() {
  const api = useApi();
  const qc = useQueryClient();
  const session = useSession((s) => s.session);
  const list = useQuery({ queryKey: ['favorites', session?.token], enabled: session !== null, queryFn: () => api.call('favorites.list') });
  const toggle = useMutation({ mutationFn: (f: FavoriteInput) => api.call('favorites.toggle', f), onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }) });
  return { signedIn: session !== null, keys: new Set((list.data ?? []).map((f) => f.key)), list, toggle };
}

export const favoriteOf = (r: SearchResult): FavoriteInput => ({
  key: r.key, serviceType: r.serviceType, name: r.name, destinationId: r.destinationId, destinationName: r.destinationName, imageSeed: r.imageSeed, rating: r.rating,
});
