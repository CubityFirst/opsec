import { asc } from "drizzle-orm";
import { Hono } from "hono";
import type { ContactKind } from "@shared/schemas/common";
import { CONTACT_KINDS } from "@shared/schemas/common";
import type { RelationshipTypeOut } from "@shared/types";
import { schema } from "../db";
import type { RelationshipTypeRow } from "../db/schema";
import type { AppEnv } from "../env";

const app = new Hono<AppEnv>();

export function parseKinds(csv: string): ContactKind[] {
  return csv
    .split(",")
    .map((k) => k.trim())
    .filter((k): k is ContactKind => (CONTACT_KINDS as readonly string[]).includes(k));
}

export function toRelationshipTypeOut(r: RelationshipTypeRow): RelationshipTypeOut {
  return {
    key: r.key,
    label: r.label,
    inverseKey: r.inverseKey,
    category: r.category,
    sortOrder: r.sortOrder,
    fromKinds: parseKinds(r.fromKinds),
    toKinds: parseKinds(r.toKinds),
  };
}

app.get("/relationship-types", async (c) => {
  const rows = await c.get("db").select().from(schema.relationshipTypes).orderBy(asc(schema.relationshipTypes.sortOrder));
  const items = rows.map(toRelationshipTypeOut);
  return c.json({ items, total: items.length });
});

export default app;
