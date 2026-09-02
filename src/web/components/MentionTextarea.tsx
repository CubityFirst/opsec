import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { mentionMarkdown } from "@shared/mentions";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { Textarea } from "@/components/ui/textarea";
import { caretCoordinates, type CaretCoordinates } from "@/lib/caret";
import { useSearch } from "@/lib/queries/search";
import { useTags } from "@/lib/queries/tags";
import { cn } from "@/lib/utils";

/** Trigger token before the caret: `@query` for contacts, `#query` for tags. */
const TRIGGER_RE = /(^|[\s(])([@#])([^\s@#()[\]]{0,40})$/;

type Suggestion = {
  key: string;
  label: string;
  insert: string;
  avatar?: { displayName: string; avatarUrl: string | null; kind: "person" | "pet" | "organization" };
  contact?: { id: string; displayName: string };
};

/**
 * A textarea with inline tagging: type `@` to mention a contact (inserted as a
 * markdown link carrying the contact id) or `#` to insert a tag.
 */
export function MentionTextarea({
  value,
  onChange,
  id,
  rows = 4,
  placeholder,
  className,
  onKeyDown,
  onPaste,
  placement = "below",
  mentionStyle = "markdown",
  onMention,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  rows?: number;
  placeholder?: string;
  className?: string;
  /** Called only when the suggestion list is closed (it owns Enter/Tab/arrows while open). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  /** Where the suggestion list opens; use "above" for composers pinned to the bottom of the screen. */
  placement?: "above" | "below";
  /** "markdown" inserts [@Name](/contacts/id) (stored bodies); "plain" inserts just @Name and reports the pick via onMention. */
  mentionStyle?: "markdown" | "plain";
  onMention?: (contact: { id: string; displayName: string }) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const trigger = useMemo(() => {
    const before = value.slice(0, caret);
    const m = TRIGGER_RE.exec(before);
    if (!m) return null;
    return { kind: m[2] as "@" | "#", query: m[3] ?? "", start: caret - (m[2]!.length + (m[3] ?? "").length) };
  }, [value, caret]);

  const search = useSearch(trigger?.kind === "@" ? trigger.query : "");
  const tags = useTags();

  const suggestions: Suggestion[] = useMemo(() => {
    if (!trigger) return [];
    if (trigger.kind === "@") {
      return (search.data?.contacts ?? []).slice(0, 8).map((c) => ({
        key: c.id,
        label: c.displayName,
        insert: mentionStyle === "plain" ? `@${c.displayName} ` : `${mentionMarkdown(c.displayName, c.id)} `,
        avatar: { displayName: c.displayName, avatarUrl: c.avatarUrl, kind: c.kind },
        contact: { id: c.id, displayName: c.displayName },
      }));
    }
    const q = trigger.query.toLowerCase();
    const known = (tags.data?.items ?? []).filter((t) => t.name.toLowerCase().includes(q)).slice(0, 8);
    const items: Suggestion[] = known.map((t) => ({ key: t.id, label: `#${t.name}`, insert: `#${t.name.replace(/\s+/g, "-")} ` }));
    if (q.length >= 2 && !known.some((t) => t.name.toLowerCase() === q)) items.push({ key: `new:${q}`, label: `#${trigger.query} (new)`, insert: `#${trigger.query} ` });
    return items;
  }, [trigger, search.data, tags.data, mentionStyle]);

  const open = !!trigger && suggestions.length > 0 && dismissed !== `${trigger.kind}${trigger.start}`;

  useEffect(() => setActive(0), [trigger?.query, trigger?.kind]);

  // Anchor the list at the "@"/"#" that started the trigger, clamped to the box width.
  const [anchor, setAnchor] = useState<(CaretCoordinates & { boxWidth: number; boxHeight: number }) | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !trigger || !el) {
      setAnchor(null);
      return;
    }
    setAnchor({ ...caretCoordinates(el, trigger.start), boxWidth: el.offsetWidth, boxHeight: el.offsetHeight });
  }, [open, trigger?.start, trigger?.kind, value]);

  const commit = (s: Suggestion) => {
    if (!trigger) return;
    if (s.contact) onMention?.(s.contact);
    const next = value.slice(0, trigger.start) + s.insert + value.slice(caret);
    onChange(next);
    const pos = trigger.start + s.insert.length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        id={id}
        rows={rows}
        placeholder={placeholder ?? "Markdown supported · @ to mention a contact · # to tag"}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setDismissed(null);
        }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (!open) {
            onKeyDown?.(e);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            commit(suggestions[active]!);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDismissed(trigger ? `${trigger.kind}${trigger.start}` : null);
          }
        }}
      />
      {open && (
        <ul
          role="listbox"
          className="absolute z-50 max-h-56 w-72 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
          style={
            anchor
              ? {
                  left: Math.max(0, Math.min(anchor.left, anchor.boxWidth - 288)),
                  ...(placement === "above" ? { bottom: anchor.boxHeight - anchor.top + 4 } : { top: anchor.top + anchor.height + 4 }),
                }
              : { left: 0, ...(placement === "above" ? { bottom: "100%", marginBottom: 4 } : { top: "100%", marginTop: 4 }) }
          }
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((s, i) => (
            <li
              key={s.key}
              role="option"
              aria-selected={i === active}
              className={cn("flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5", i === active && "bg-accent text-accent-foreground")}
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(s)}
            >
              {s.avatar && <ContactAvatar contact={s.avatar} className="size-5" />}
              <span className="truncate">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
