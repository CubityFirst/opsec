import { z } from "zod";
import {
  birthdaySchema,
  boolQuery,
  contactKindSchema,
  contactMethodTypeSchema,
  idSchema,
  nonBlank,
  optionalText,
  paginationSchema,
} from "./common";

export const customFieldsSchema = z
  .record(z.string().min(1).max(100), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))
  .refine((o) => Object.keys(o).length <= 50, "At most 50 custom fields");
export type CustomFields = z.infer<typeof customFieldsSchema>;

export const contactMethodInputSchema = z.object({
  type: contactMethodTypeSchema,
  label: optionalText(100),
  value: nonBlank(1000),
  isPrimary: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});
export type ContactMethodInput = z.infer<typeof contactMethodInputSchema>;

export const contactMethodUpdateSchema = contactMethodInputSchema.partial();
export type ContactMethodUpdate = z.infer<typeof contactMethodUpdateSchema>;

/** Another name a contact goes by, e.g. { label: "Chinese name", value: "陈伟" }. */
export const otherNameSchema = z.object({ label: nonBlank(50), value: nonBlank(200) });
export type OtherName = z.infer<typeof otherNameSchema>;

const contactFields = {
  kind: contactKindSchema,
  firstName: nonBlank(200),
  lastName: optionalText(200),
  nickname: optionalText(200),
  pronouns: optionalText(40),
  otherNames: z.array(otherNameSchema).max(20).optional(),
  /** How we met. `metOn` uses the same partial-date format as `birthday`. */
  metOn: birthdaySchema.nullish().transform((v) => v ?? null),
  metWhere: optionalText(200),
  metHow: optionalText(2000),
  /** Contact who introduced us, or through whom we know this person. */
  metViaContactId: idSchema.nullish().transform((v) => v ?? null),
  /** Work: free-text title and the employer (must be an organisation contact). */
  jobTitle: optionalText(200),
  employerContactId: idSchema.nullish().transform((v) => v ?? null),
  birthday: birthdaySchema.nullish().transform((v) => v ?? null),
  notes: optionalText(50_000),
  customFields: customFieldsSchema.optional(),
};

export const contactCreateSchema = z.object({
  ...contactFields,
  methods: z.array(contactMethodInputSchema).max(50).optional().default([]),
  tagNames: z.array(nonBlank(50)).max(50).optional().default([]),
});
export type ContactCreateInput = z.infer<typeof contactCreateSchema>;

export const contactUpdateSchema = z.object(contactFields).partial();
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;

export const contactSortSchema = z.enum(["name", "lastContacted", "updated"]);
export type ContactSort = z.infer<typeof contactSortSchema>;

export const contactListQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  kind: contactKindSchema.optional(),
  tag: z.string().trim().max(50).optional(),
  archived: boolQuery.optional().default(false),
  sort: contactSortSchema.optional().default("name"),
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

export const setTagsSchema = z.object({ tagNames: z.array(nonBlank(50)).max(50) });
export type SetTagsInput = z.infer<typeof setTagsSchema>;

export const CONTACT_BULK_ACTIONS = ["addTags", "removeTags", "archive", "unarchive", "delete"] as const;
export type ContactBulkAction = (typeof CONTACT_BULK_ACTIONS)[number];

/** One action applied to many contacts. `delete` requires the admin role. */
export const contactBulkSchema = z
  .object({
    ids: z.array(idSchema).min(1).max(200),
    action: z.enum(CONTACT_BULK_ACTIONS),
    tagNames: z.array(nonBlank(50)).max(50).optional().default([]),
  })
  .refine((v) => (v.tagNames?.length ?? 0) * v.ids.length <= 2000, "Too many contact × tag combinations in one request (max 2000)")
  .refine((v) => !(v.action === "addTags" || v.action === "removeTags") || v.tagNames.length > 0, {
    message: "At least one tag name is required",
    path: ["tagNames"],
  });
export type ContactBulkInput = z.infer<typeof contactBulkSchema>;
