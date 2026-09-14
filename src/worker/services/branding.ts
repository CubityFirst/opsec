import { eq } from "drizzle-orm";
import { brandingUpdateSchema, DEFAULT_BRANDING, type Branding, type BrandingOut, type BrandingUpdate } from "@shared/schemas/branding";
import { schema, type Db } from "../db";
import { nowIso } from "../lib/time";

const KEY = "branding";

/** The saved branding, or null when the instance still uses the defaults. */
export async function loadBranding(db: Db): Promise<{ branding: Branding; updatedAt: string } | null> {
  const row = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, KEY)).get();
  if (!row) return null;
  // A row written by an older shape must not take the app's own name down: an
  // unreadable value simply reads as the defaults.
  const parsed = brandingUpdateSchema.safeParse(row.value);
  return { branding: parsed.success ? parsed.data : DEFAULT_BRANDING, updatedAt: row.updatedAt };
}

export async function resolveBranding(db: Db): Promise<BrandingOut> {
  const stored = await loadBranding(db);
  if (stored) return { branding: stored.branding, source: "db", updatedAt: stored.updatedAt };
  return { branding: DEFAULT_BRANDING, source: "default", updatedAt: null };
}

export async function saveBranding(db: Db, input: BrandingUpdate): Promise<void> {
  const value = input as unknown as Record<string, unknown>;
  const now = nowIso();
  await db
    .insert(schema.appSettings)
    .values({ key: KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: now } });
}

/** Back to the stock wording; the row is dropped rather than rewritten with the defaults. */
export async function clearBranding(db: Db): Promise<void> {
  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, KEY));
}
