import { z } from "zod";
import { CONTACT_COLUMNS, DEFAULT_CONTACT_COLUMNS } from "../contact-columns";

/**
 * Per-user UI preferences, stored in `users.preferences` and updated with
 * `PATCH /api/auth/preferences`. Every field must have a default so a missing row
 * reads as the defaults.
 */
export const userPreferencesSchema = z.object({
  /** Optional columns of the contacts table; the name column is always shown. */
  contactColumns: z
    .array(z.enum(CONTACT_COLUMNS))
    .max(CONTACT_COLUMNS.length)
    .default(() => [...DEFAULT_CONTACT_COLUMNS]),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const userPreferencesUpdateSchema = userPreferencesSchema.partial();
export type UserPreferencesUpdate = z.infer<typeof userPreferencesUpdateSchema>;

export function withPreferenceDefaults(raw: unknown): UserPreferences {
  const parsed = userPreferencesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : userPreferencesSchema.parse({});
}
