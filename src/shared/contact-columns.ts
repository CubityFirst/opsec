/**
 * The optional columns of the contacts table. The name (with avatar, kind and the
 * line of nicknames and job under it) is always there, so it is not listed here.
 *
 * The order is the order the table renders them in, whatever order the stored
 * preference happens to be in. Add to the end; the keys are persisted per user in
 * `users.preferences.contactColumns`.
 */
export const CONTACT_COLUMNS = ["tags", "contact", "lastSpoke", "country", "birthday", "job", "added"] as const;
export type ContactColumn = (typeof CONTACT_COLUMNS)[number];

export const CONTACT_COLUMN_LABELS: Record<ContactColumn, string> = {
  tags: "Tags",
  contact: "Phone & email",
  lastSpoke: "Last spoke",
  country: "Country",
  birthday: "Birthday",
  job: "Job",
  added: "Added",
};

/** What a new user sees: exactly the columns the table had before it was configurable. */
export const DEFAULT_CONTACT_COLUMNS: ContactColumn[] = ["tags", "contact", "lastSpoke"];

/** The chosen columns in table order, with anything unknown or repeated dropped. */
export function orderedColumns(chosen: readonly ContactColumn[]): ContactColumn[] {
  return CONTACT_COLUMNS.filter((c) => chosen.includes(c));
}
