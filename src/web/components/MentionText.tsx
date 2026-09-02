import type { ReactNode } from "react";
import { MENTION_RE } from "@shared/mentions";
import { ContactPeek } from "@/components/contacts/ContactPeek";

/**
 * One-line text (interaction summaries, titles) with `[@Name](/contacts/id)`
 * mentions rendered as contact chips. Everything else is shown verbatim, so it
 * is safe for fields that are not markdown.
 */
export function MentionText({ text, chipClassName }: { text: string; chipClassName?: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <ContactPeek key={`${start}-${m[2]}`} id={m[2]!} className={chipClassName ?? "rounded bg-primary/10 px-1 font-medium text-primary hover:bg-primary/20"}>
        @{m[1]}
      </ContactPeek>,
    );
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
