import { desc, eq } from "drizzle-orm";
import type { LifeEventOut } from "@shared/types";
import { schema, type Db } from "../db";
import type { LifeEventRow } from "../db/schema";

const { lifeEvents } = schema;

export function toLifeEventOut(r: LifeEventRow): LifeEventOut {
  return {
    id: r.id,
    contactId: r.contactId,
    category: r.category,
    title: r.title,
    occurredOn: r.occurredOn,
    body: r.body,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** A contact's life events, newest first. */
export async function listLifeEvents(db: Db, contactId: string): Promise<LifeEventOut[]> {
  const rows = await db.select().from(lifeEvents).where(eq(lifeEvents.contactId, contactId)).orderBy(desc(lifeEvents.occurredOn), desc(lifeEvents.id));
  return rows.map(toLifeEventOut);
}
