import { z } from "zod";
import { nonBlank, optionalText } from "./common";

export const tagCreateSchema = z.object({
  name: nonBlank(50),
  color: optionalText(20),
});
export type TagCreateInput = z.infer<typeof tagCreateSchema>;

export const tagUpdateSchema = tagCreateSchema.partial();
export type TagUpdateInput = z.infer<typeof tagUpdateSchema>;
