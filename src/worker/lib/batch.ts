import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../db";

export type Stmt = BatchItem<"sqlite">;
type Item = Stmt;

/**
 * Run a set of prepared Drizzle statements atomically via D1 batch. D1 has no
 * interactive transactions, so this is the only way to make multi-table
 * writes all-or-nothing. Tolerates an empty list.
 */
export async function runBatch(db: Db, items: Item[]): Promise<void> {
  if (items.length === 0) return;
  await db.batch(items as unknown as [Item, ...Item[]]);
}

/** Split an array into chunks so `inArray()` stays under D1's 100 bound-parameter limit. */
export function chunk<T>(arr: T[], size = 50): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
