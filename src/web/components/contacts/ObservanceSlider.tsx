import { OBSERVANCE_LABELS } from "@shared/religion";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

/** Where the thumb rests before anything has been recorded (the middle of the ladder). */
const UNSET_POSITION = 2;

/**
 * How much of their religion someone practises, on the {@link OBSERVANCE_LABELS}
 * ladder. `null` means it was never recorded, which is not the same as 0 ("not
 * practising"), so the slider stays dimmed and captioned until it is touched and
 * "Clear" puts it back.
 */
export function ObservanceSlider({
  value,
  onChange,
  disabled = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  const recorded = value != null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Label>How devoted</Label>
        {recorded && !disabled && (
          <button type="button" onClick={() => onChange(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline">
            Clear
          </button>
        )}
      </div>
      <Slider
        min={0}
        max={OBSERVANCE_LABELS.length - 1}
        step={1}
        value={[value ?? UNSET_POSITION]}
        disabled={disabled}
        onValueChange={([v]) => onChange(v ?? null)}
        aria-label="How devoted"
        aria-valuetext={recorded ? OBSERVANCE_LABELS[value] : "Not recorded"}
        className={!recorded || disabled ? "opacity-50" : undefined}
      />
      <p className="text-xs text-muted-foreground">
        {disabled ? "Add a religion first." : recorded ? OBSERVANCE_LABELS[value] : "Not recorded — drag to set."}
      </p>
    </div>
  );
}
