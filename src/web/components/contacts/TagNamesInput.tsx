import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useTags } from "@/lib/queries/tags";
import { TagChip } from "./TagChip";

/** Free-text tag entry: Enter or comma adds, Backspace on empty removes last. */
export function TagNamesInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const { data } = useTags();
  const known = new Map((data?.items ?? []).map((t) => [t.name.toLowerCase(), t]));

  const add = (raw: string) => {
    const typed = raw.trim().replace(/,+$/, "").trim();
    if (!typed) return;
    // Prefer the existing tag's spelling so "friend" and "Friend" stay one tag.
    const name = known.get(typed.toLowerCase())?.name ?? typed;
    if (value.some((v) => v.toLowerCase() === name.toLowerCase())) return;
    onChange([...value, name]);
  };

  const suggestions = draft.trim()
    ? [...known.values()].filter(
        (t) => t.name.toLowerCase().includes(draft.trim().toLowerCase()) && !value.some((v) => v.toLowerCase() === t.name.toLowerCase()),
      ).slice(0, 6)
    : [];

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((name) => (
            <TagChip key={name} tag={{ name, color: known.get(name.toLowerCase())?.color ?? null }} onRemove={() => onChange(value.filter((v) => v !== name))} />
          ))}
        </div>
      )}
      <Input
        value={draft}
        placeholder={placeholder ?? "Add tag and press Enter"}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) {
            add(v);
            setDraft("");
          } else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
            setDraft("");
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft.trim()) {
            add(draft);
            setDraft("");
          }
        }}
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((t) => (
            <button
              key={t.id}
              type="button"
              className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              // Keep focus in the input: otherwise the input's onBlur commits the
              // half-typed filter text before this click handler runs.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                add(t.name);
                setDraft("");
              }}
            >
              + {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
