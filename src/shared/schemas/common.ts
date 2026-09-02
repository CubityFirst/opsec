import { z } from "zod";

export const CONTACT_KINDS = ["person", "pet", "organization"] as const;
export const CONTACT_METHOD_TYPES = ["phone", "email", "address", "social", "url", "other"] as const;
export const RELATIONSHIP_CATEGORIES = ["family", "social", "group", "work", "pet", "care", "other"] as const;
export const INTERACTION_TYPES = ["call", "text", "email", "meeting", "meal", "gift", "event", "note", "other"] as const;
export const FILE_KINDS = ["avatar", "avatar_original", "attachment"] as const;
export const ENTITY_TYPES = ["contact", "contact_method", "tag", "relationship", "interaction", "file", "life_event"] as const;

export const contactKindSchema = z.enum(CONTACT_KINDS);
export const contactMethodTypeSchema = z.enum(CONTACT_METHOD_TYPES);
export const relationshipCategorySchema = z.enum(RELATIONSHIP_CATEGORIES);
export const interactionTypeSchema = z.enum(INTERACTION_TYPES);
export const fileKindSchema = z.enum(FILE_KINDS);
export const entityTypeSchema = z.enum(ENTITY_TYPES);

export type ContactKind = z.infer<typeof contactKindSchema>;
export type ContactMethodType = z.infer<typeof contactMethodTypeSchema>;
export type RelationshipCategory = z.infer<typeof relationshipCategorySchema>;
export type InteractionType = z.infer<typeof interactionTypeSchema>;
export type FileKind = z.infer<typeof fileKindSchema>;
export type EntityType = z.infer<typeof entityTypeSchema>;

/** Date-only string, e.g. 1990-04-12. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
/**
 * Birthday / founded date where any part may be unknown, using ISO 8601
 * reduced precision: `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, `--MM-DD` (no year)
 * or `--MM` (month only). A day always needs a month.
 */
export const BIRTHDAY_RE = /^(?:(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?|--(\d{2})(?:-(\d{2}))?)$/;

export function parsePartialDate(value: string): { year: number | null; month: number | null; day: number | null } | null {
  const m = BIRTHDAY_RE.exec(value);
  if (!m) return null;
  const year = m[1] ? Number(m[1]) : null;
  const month = m[2] ?? m[4] ?? null;
  const day = m[3] ?? m[5] ?? null;
  return { year, month: month ? Number(month) : null, day: day ? Number(day) : null };
}

export const birthdaySchema = z
  .string()
  .regex(BIRTHDAY_RE, "Expected YYYY-MM-DD, YYYY-MM, YYYY, --MM-DD or --MM")
  .refine((v) => {
    const p = parsePartialDate(v);
    if (!p) return false;
    if (p.year !== null && p.year < 1) return false;
    if (p.month !== null && (p.month < 1 || p.month > 12)) return false;
    if (p.day !== null) {
      // 2000 is a leap year, so 29 Feb is allowed when the year is unknown.
      const daysInMonth = new Date(Date.UTC(p.year ?? 2000, p.month!, 0)).getUTCDate();
      if (p.day < 1 || p.day > daysInMonth) return false;
    }
    return true;
  }, "Not a valid calendar date");

/** Full ISO-8601 datetime. Stored as UTC. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const idSchema = z.string().min(1).max(64);

/** Short text that must not be blank once trimmed. */
export const nonBlank = (max = 200) => z.string().trim().min(1).max(max);
/** Optional text: empty strings are normalised to null. */
export const optionalText = (max = 5000) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v && v.trim().length > 0 ? v : null));

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const boolQuery = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");
