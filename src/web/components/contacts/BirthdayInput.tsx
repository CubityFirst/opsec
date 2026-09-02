import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { composeBirthday, parseBirthday } from "@/lib/format";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Day / month / year editor where every part is optional. `value` is the
 * stored form: "YYYY-MM-DD", "YYYY-MM", "YYYY", "--MM-DD", "--MM" or "".
 * A day can only be entered once a month is chosen.
 */
export function BirthdayInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
}) {
  const parts = parseBirthday(value) ?? { year: null, month: null, day: null };
  const update = (patch: Partial<typeof parts>) => onChange(composeBirthday({ ...parts, ...patch }));

  return (
    <div className="grid min-w-0 grid-cols-[minmax(3.5rem,4.5rem)_minmax(0,1fr)_minmax(4rem,5.5rem)_auto] gap-2">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={31}
        placeholder="Day"
        aria-label="Day"
        aria-invalid={invalid}
        className="min-w-0 px-2"
        disabled={!parts.month}
        title={parts.month ? undefined : "Choose a month first"}
        value={parts.day ?? ""}
        onChange={(e) => update({ day: e.target.value ? Number(e.target.value) : null })}
      />
      <Select value={parts.month ? String(parts.month) : ""} onValueChange={(v) => update({ month: v ? Number(v) : null })}>
        <SelectTrigger className="w-full min-w-0" aria-label="Month" aria-invalid={invalid}>
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((name, i) => (
            <SelectItem key={name} value={String(i + 1)}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={9999}
        placeholder="Year"
        aria-label="Year"
        aria-invalid={invalid}
        className="min-w-0 px-2"
        value={parts.year ?? ""}
        onChange={(e) => update({ year: e.target.value ? Number(e.target.value) : null })}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Clear date"
        title="Clear"
        className={value ? "" : "invisible"}
        onClick={() => onChange("")}
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}
