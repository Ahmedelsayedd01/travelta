import { emailSchema, requiredText, serviceTypeSchema, z } from '@travelta/schemas';

/** Demo form schema for the design-system page — built only from shared @travelta/schemas primitives. */
export const sampleFormSchema = z.object({
  name: requiredText(120),
  email: emailSchema,
  service: serviceTypeSchema,
  notes: z.string().max(500, { error: 'validation.too_long' }).optional(),
  notify: z.boolean(),
});

export type SampleForm = z.input<typeof sampleFormSchema>;
