import { z } from 'zod';
import { localizedTextSchema } from '../primitives';
import { serviceTypeSchema } from '../enums';
import { entityBaseSchema } from './base';

/**
 * A customer's saved product (wish list). Keyed by the search result key, so API content without a catalog product
 * can be saved too; the display fields are a snapshot for the list (prices are always re-searched, never stored).
 */
export const favoriteEntitySchema = entityBaseSchema.extend({
  userId: z.string(),
  key: z.string().min(1).max(200),
  serviceType: serviceTypeSchema,
  name: localizedTextSchema,
  destinationId: z.string(),
  destinationName: localizedTextSchema,
  imageSeed: z.number().int(),
  rating: z.number().min(0).max(5),
});
export type FavoriteEntity = z.infer<typeof favoriteEntitySchema>;
