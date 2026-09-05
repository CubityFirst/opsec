import { z } from "zod";
import { idSchema, isoDateSchema, nonBlank, optionalText } from "./common";

export const REPEAT_UNITS = ["day", "week", "month", "year"] as const;
export const repeatUnitSchema = z.enum(REPEAT_UNITS);
export type RepeatUnit = z.infer<typeof repeatUnitSchema>;

/** How a recurring reminder repeats: every `every` units, optionally stopping after `until` (inclusive). */
export const repeatSchema = z.object({
  every: z.number().int().min(1).max(999),
  unit: repeatUnitSchema,
  /** Last day on which an occurrence may fall (YYYY-MM-DD); null or omitted = forever. */
  until: isoDateSchema.nullable().optional(),
});
export type Repeat = z.infer<typeof repeatSchema>;

export const REMINDER_STATUSES = ["open", "done"] as const;
export const reminderStatusSchema = z.enum(REMINDER_STATUSES);
export type ReminderStatus = z.infer<typeof reminderStatusSchema>;

export const reminderCreateSchema = z.object({
  /** The contact this is about, if any ("call Mum" vs "renew passport"). */
  contactId: idSchema.nullable().optional(),
  title: nonBlank(200),
  notes: optionalText(20_000),
  /** First (or only) day it is due. */
  dueOn: isoDateSchema,
  /** null or omitted = one-off. */
  repeat: repeatSchema.nullable().optional(),
});
export type ReminderCreateInput = z.infer<typeof reminderCreateSchema>;

export const reminderUpdateSchema = reminderCreateSchema.partial();
export type ReminderUpdateInput = z.infer<typeof reminderUpdateSchema>;

export const reminderListQuerySchema = z.object({
  status: reminderStatusSchema.optional(),
  /** Only open reminders due on or before this day (YYYY-MM-DD). */
  dueBy: isoDateSchema.optional(),
  contactId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ReminderListQuery = z.infer<typeof reminderListQuerySchema>;

const UNIT_LABELS: Record<RepeatUnit, [one: string, many: string]> = {
  day: ["day", "days"],
  week: ["week", "weeks"],
  month: ["month", "months"],
  year: ["year", "years"],
};

/** "once", "every week", "every 2 months", "every year until 2027-06-01". Pass `formatUntil` to render the date your way. */
export function describeRepeat(r: Repeat | null | undefined, formatUntil: (day: string) => string = (d) => d): string {
  if (!r) return "once";
  const [one, many] = UNIT_LABELS[r.unit];
  const base = r.every === 1 ? `every ${one}` : `every ${r.every} ${many}`;
  return r.until ? `${base} until ${formatUntil(r.until)}` : base;
}
