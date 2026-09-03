import type { ReactNode } from "react";
import { Link } from "react-router";
import { HASHTAG_RE, MENTION_RE } from "@shared/mentions";
import { ContactPeek } from "@/components/contacts/ContactPeek";

/** Plain text with `#tag` tokens rendered as chips linking to the filtered contacts list. */
function withHashtags(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(HASHTAG_RE)) {
    const start = (m.index ?? 0) + m[1]!.length;
    if (start > last) parts.push(text.slice(last, start));
    const tag = m[2]!;
    parts.push(
      <Link key={`${keyPrefix}-${start}`} to={`/contacts?tag=${encodeURIComponent(tag.toLowerCase())}`} className="rounded bg-muted px-1 text-foreground/80 hover:bg-muted/70">
        #{tag}
      </Link>,
    );
    last = start + 1 + tag.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * One-line text (interaction summaries, titles) with `[@Name](/contacts/id)`
 * mentions rendered as contact chips and `#tag` hashtags as tag chips, matching
 * how MarkdownBody shows them in bodies. Everything else is shown verbatim, so
 * it is safe for fields that are not markdown.
 */
export function MentionText({ text, chipClassName }: { text: string; chipClassName?: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(...withHashtags(text.slice(last, start), `h${last}`));
    parts.push(
      <ContactPeek key={`${start}-${m[2]}`} id={m[2]!} className={chipClassName ?? "rounded bg-primary/10 px-1 font-medium text-primary hover:bg-primary/20"}>
        @{m[1]}
      </ContactPeek>,
    );
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(...withHashtags(text.slice(last), `h${last}`));
  return <>{parts}</>;
}
