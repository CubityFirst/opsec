import { z } from "zod";
import { birthdaySchema, nonBlank, optionalText } from "./common";

export const LIFE_EVENT_CATEGORIES = ["work_education", "family_relationships", "home_living", "health_wellness", "travel_experiences"] as const;
export const lifeEventCategorySchema = z.enum(LIFE_EVENT_CATEGORIES);
export type LifeEventCategory = z.infer<typeof lifeEventCategorySchema>;

export const LIFE_EVENT_CATEGORY_LABELS: Record<LifeEventCategory, string> = {
  work_education: "Work & education",
  family_relationships: "Family & relationships",
  home_living: "Home & living",
  health_wellness: "Health & wellness",
  travel_experiences: "Travel & experiences",
};

export const lifeEventCreateSchema = z.object({
  category: lifeEventCategorySchema,
  title: nonBlank(200),
  /** Partial date: YYYY-MM-DD, YYYY-MM, YYYY, --MM-DD or --MM. */
  occurredOn: birthdaySchema,
  body: optionalText(20_000),
});
export type LifeEventCreateInput = z.infer<typeof lifeEventCreateSchema>;

export const lifeEventUpdateSchema = lifeEventCreateSchema.partial();
export type LifeEventUpdateInput = z.infer<typeof lifeEventUpdateSchema>;
