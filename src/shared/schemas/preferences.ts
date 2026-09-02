import { z } from "zod";

/** Per-user UI preferences. Every field has a default so a missing row reads as the defaults. */
export const userPreferencesSchema = z.object({
  /** When false, the dashboard masks names and avatars (useful when screen sharing). */
  dashboardShowContactDetails: z.boolean().default(true),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const userPreferencesUpdateSchema = userPreferencesSchema.partial();
export type UserPreferencesUpdate = z.infer<typeof userPreferencesUpdateSchema>;

export function withPreferenceDefaults(raw: unknown): UserPreferences {
  const parsed = userPreferencesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : userPreferencesSchema.parse({});
}
