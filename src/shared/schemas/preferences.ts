import { z } from "zod";

/**
 * Per-user UI preferences. Every field must have a default so a missing row
 * reads as the defaults. Currently empty: the schema, the `users.preferences`
 * column and `PATCH /api/auth/preferences` stay so a future preference is one
 * field here plus a control on the Account page.
 */
export const userPreferencesSchema = z.object({});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const userPreferencesUpdateSchema = userPreferencesSchema.partial();
export type UserPreferencesUpdate = z.infer<typeof userPreferencesUpdateSchema>;

export function withPreferenceDefaults(raw: unknown): UserPreferences {
  const parsed = userPreferencesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : userPreferencesSchema.parse({});
}
