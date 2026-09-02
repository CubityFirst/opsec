import { monotonicFactory } from "ulidx";

const ulid = monotonicFactory();

/** Time-sortable unique id. Rows created in the same millisecond keep insertion order. */
export function newId(): string {
  return ulid();
}
