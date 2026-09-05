import { asc, count, eq } from "drizzle-orm";
import { schema, type Db } from "../../db";
import { AskToolError } from "./tool-def";

const { tags, contactTags } = schema;

export interface TagVocabularyItem {
  name: string;
  contacts: number;
}

/** Every tag with its usage count, alphabetically. Tags are a shared vocabulary, so the model needs the whole list, not a search. */
export async function listTagVocabulary(db: Db): Promise<TagVocabularyItem[]> {
  const rows = await db
    .select({ name: tags.name, contacts: count(contactTags.contactId) })
    .from(tags)
    .leftJoin(contactTags, eq(contactTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(tags.nameLower));
  return rows.map((r) => ({ name: r.name, contacts: r.contacts }));
}

/** Lower-cased word stems: "Colleague of mine" → ["colleague", "of", "mine"]; a trailing "s" is dropped so "clients" ≈ "client". */
function stems(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

/**
 * An existing tag that the requested name is probably a rewording of: the
 * same words in a different form ("colleagues" / "colleague"), or one name's
 * words all appearing in the other ("colleague of mine" / "colleague",
 * "work" / "work friend").
 */
export function nearestTag(requested: string, existing: string[]): string | null {
  const want = new Set(stems(requested));
  if (want.size === 0) return null;
  let best: { name: string; score: number } | null = null;
  for (const name of existing) {
    const have = new Set(stems(name));
    if (have.size === 0) continue;
    const overlap = [...want].filter((w) => have.has(w)).length;
    const contained = overlap === have.size || overlap === want.size;
    if (!contained) continue;
    // Prefer the closest in length so "colleague" beats "work colleague" for "colleague of mine".
    const score = overlap * 10 - Math.abs(have.size - want.size);
    if (!best || score > best.score) best = { name, score };
  }
  return best?.name ?? null;
}

const MAX_LISTED = 80;

/**
 * Maps the tag names a proposal wants to add onto the existing vocabulary:
 * an exact (case-insensitive) match takes the stored spelling, a near match
 * is refused with a pointer to the existing tag unless `createNew` is set,
 * and genuinely new names pass through unchanged.
 */
export async function resolveTagNames(db: Db, requested: string[], createNew = false): Promise<string[]> {
  if (requested.length === 0) return [];
  const vocabulary = await listTagVocabulary(db);
  const byLower = new Map(vocabulary.map((t) => [t.name.toLowerCase(), t.name]));
  const out: string[] = [];
  for (const raw of requested) {
    const name = raw.trim();
    const exact = byLower.get(name.toLowerCase());
    if (exact) {
      out.push(exact);
      continue;
    }
    if (!createNew) {
      const near = nearestTag(name, [...byLower.values()]);
      if (near) {
        const listed = vocabulary.slice(0, MAX_LISTED).map((t) => t.name);
        throw new AskToolError(
          `“${name}” looks like the existing tag “${near}”. Tags are a shared vocabulary: pass “${near}” exactly, or ask the user (suggest_replies) whether they want a separate new tag and, if so, call again with createNew: true. Existing tags: ${listed.join(", ")}${vocabulary.length > MAX_LISTED ? ", …" : ""}.`,
        );
      }
    }
    out.push(name);
  }
  return out;
}
