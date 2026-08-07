import { z } from 'zod';
import { relocationReasonSchema } from '../actions/details.schema';

/**
 * Moving a colony to another apiary.
 *
 * `date` is the day the move happens on and may lie in the future: such a move
 * is recorded as planned and only takes effect on `Hive.apiaryId` once the date
 * has passed. Omitting it means "now".
 */
export const relocateHiveSchema = z.object({
  toApiaryId: z.string().uuid(),
  date: z.string().datetime().optional(),
  reason: relocationReasonSchema.optional(),
  notes: z.string().max(2000).optional(),
});

/** Moving several colonies in one go — the migratory-beekeeping case. */
export const relocateHivesSchema = relocateHiveSchema.extend({
  hiveIds: z.array(z.string().uuid()).min(1).max(500),
});

export const relocationResultSchema = z.object({
  hiveId: z.string().uuid(),
  actionId: z.string().uuid(),
  fromApiaryId: z.string().uuid().nullable(),
  toApiaryId: z.string().uuid(),
  date: z.string().datetime(),
  /** False while the move is still scheduled for a future date. */
  applied: z.boolean(),
});

export const relocationBulkResultSchema = z.object({
  moved: z.array(relocationResultSchema),
  /** Hives already standing at the destination; no action was recorded. */
  skipped: z.array(z.string().uuid()),
});

export type RelocateHive = z.infer<typeof relocateHiveSchema>;
export type RelocateHives = z.infer<typeof relocateHivesSchema>;
export type RelocationResult = z.infer<typeof relocationResultSchema>;
export type RelocationBulkResult = z.infer<typeof relocationBulkResultSchema>;
