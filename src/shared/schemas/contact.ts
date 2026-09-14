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
import { OBSERVANCE_LABELS } from "../religion";
import { coordinatesField } from "./geo";

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
  /** Address methods only: where it is on the map. */
  coordinates: coordinatesField,
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
  /** Faith or belief, free text ({@link RELIGION_SUGGESTIONS} only fills the picker); people only. */
  religion: optionalText(60),
  /** How observant they are: index into {@link OBSERVANCE_LABELS}; null = never recorded, 0 = not practising. */
  religionObservance: z
    .number()
    .int()
    .min(0)
    .max(OBSERVANCE_LABELS.length - 1)
    .nullish()
    .transform((v) => v ?? null),
  /** Where they are from, free text ({@link COUNTRY_SUGGESTIONS} only fills the picker); people, pets and organisations alike. */
  originCountry: optionalText(100),
  /** Pets only: species or breed, free text. */
  animalType: optionalText(100),
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
  /** false excludes the contact from keep-in-touch checks (dashboard "Out of touch"). Default true. */
  keepInTouch: z.boolean().optional(),
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
  /** true: only deceased contacts (archived is then ignored). false (default): deceased contacts are left out. */
  deceased: boolQuery.optional().default(false),
  /** Filter on the keep-in-touch opt-out: false lists only the "do not remind me" contacts, true only the nudged ones. Omitted: both. */
  keepInTouch: boolQuery.optional(),
  sort: contactSortSchema.optional().default("name"),
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

/** Body of `POST /contacts/:id/deceased`. */
export const markDeceasedSchema = z.object({
  /** Date of death, partial (YYYY-MM-DD, YYYY-MM, YYYY, --MM-DD, --MM). */
  on: birthdaySchema.nullish().transform((v) => v ?? null),
});
export type MarkDeceasedInput = z.infer<typeof markDeceasedSchema>;

export const setTagsSchema = z.object({ tagNames: z.array(nonBlank(50)).max(50) });
export type SetTagsInput = z.infer<typeof setTagsSchema>;

export const CONTACT_BULK_ACTIONS = ["addTags", "removeTags", "setFields", "archive", "unarchive", "delete"] as const;
export type ContactBulkAction = (typeof CONTACT_BULK_ACTIONS)[number];

/**
 * The fields one bulk edit can set on every selected contact ("these forty are all
 * from the UK", "these twelve work at Acme"). A key that is present is applied, and
 * null (or "") clears it, so an omitted key and a null one mean different things.
 * Everything but `keepInTouch` is people-only and is skipped for pets and
 * organisations rather than failing the whole request.
 */
export const contactBulkFieldsSchema = z
  .object({
    religion: contactFields.religion,
    religionObservance: contactFields.religionObservance,
    originCountry: contactFields.originCountry,
    jobTitle: contactFields.jobTitle,
    employerContactId: contactFields.employerContactId,
    keepInTouch: z.boolean(),
  })
  .partial();
export type ContactBulkFields = z.infer<typeof contactBulkFieldsSchema>;

/** One action applied to many contacts. `delete` requires the admin role. */
export const contactBulkSchema = z
  .object({
    ids: z.array(idSchema).min(1).max(200),
    action: z.enum(CONTACT_BULK_ACTIONS),
    tagNames: z.array(nonBlank(50)).max(50).optional().default([]),
    fields: contactBulkFieldsSchema.optional().default({}),
  })
  .refine((v) => (v.tagNames?.length ?? 0) * v.ids.length <= 2000, "Too many contact × tag combinations in one request (max 2000)")
  .refine((v) => !(v.action === "addTags" || v.action === "removeTags") || v.tagNames.length > 0, {
    message: "At least one tag name is required",
    path: ["tagNames"],
  })
  .refine((v) => v.action !== "setFields" || Object.keys(v.fields).length > 0, {
    message: "At least one field is required",
    path: ["fields"],
  });
export type ContactBulkInput = z.infer<typeof contactBulkSchema>;
