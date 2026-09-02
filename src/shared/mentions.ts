/**
 * Inline tagging inside markdown bodies (interaction details, contact notes).
 *
 * - Mentions are ordinary markdown links to a contact: `[@Alice Hartley](/contacts/<id>)`.
 *   They survive any markdown renderer and carry the id, so renames do not break them.
 * - Hashtags are plain `#word` tokens; `linkifyHashtags` turns them into links to
 *   the contacts list filtered by that tag at render time.
 */

export const MENTION_RE = /\[@([^\]]+)\]\(\/contacts\/([A-Za-z0-9]{10,64})\)/g;

/** Markdown for a mention of a contact. */
export function mentionMarkdown(displayName: string, contactId: string): string {
  return `[@${displayName.replace(/[\[\]]/g, "")}](/contacts/${contactId})`;
}

/** Mentions reduced to "@Name" for places that cannot render chips (tooltips, document titles). */
export function plainMentions(text: string): string {
  return text.replace(MENTION_RE, "@$1");
}

/** Unique contact ids mentioned in a body, in order of first appearance. */
export function extractMentionIds(body: string | null | undefined): string[] {
  if (!body) return [];
  const ids: string[] = [];
  for (const m of body.matchAll(MENTION_RE)) {
    const id = m[2]!;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Hashtag: `#` followed by 2+ word characters/hyphens, not preceded by a word char, `&`, or `/`. */
export const HASHTAG_RE = /(^|[^\w&/#])#([A-Za-z][\w-]{1,49})(?![\w-])/g;

/** Unique hashtag names (lower-cased) in a body. */
export function extractHashtags(body: string | null | undefined): string[] {
  if (!body) return [];
  const tags: string[] = [];
  for (const m of body.matchAll(HASHTAG_RE)) {
    const t = m[2]!.toLowerCase();
    if (!tags.includes(t)) tags.push(t);
  }
  return tags;
}

/**
 * Replace `#tag` with a markdown link to the filtered contacts list. Skips
 * fenced/inline code and text that is already a link target.
 */
export function linkifyHashtags(body: string): string {
  const parts = body.split(/(```[\s\S]*?```|`[^`\n]*`|\]\([^)]*\))/);
  return parts
    .map((part, i) => (i % 2 === 1 ? part : part.replace(HASHTAG_RE, (_m, pre: string, tag: string) => `${pre}[#${tag}](/contacts?tag=${encodeURIComponent(tag.toLowerCase())})`)))
    .join("");
}
