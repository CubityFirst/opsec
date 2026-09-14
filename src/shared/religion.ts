/**
 * Suggestions for the religion field, nothing more: `contacts.religion` is free
 * text and any value is accepted, so no one has to be filed under a label that
 * is not theirs. The list only fills the picker's datalist, in alphabetical
 * order, and is deliberately coarse — denominations, traditions and anything
 * else are typed in full ("Sunni Muslim", "Reform Jewish", "Quaker", "Raised
 * Catholic, not practising").
 */
export const RELIGION_SUGGESTIONS = [
  "Agnostic",
  "Atheist",
  "Bahá'í",
  "Buddhist",
  "Christian",
  "Hindu",
  "Jain",
  "Jewish",
  "Muslim",
  "None",
  "Pagan",
  "Sikh",
  "Spiritual",
  "Zoroastrian",
] as const;

/**
 * How much of it they practise, as a small ladder rather than a number the user
 * has to interpret: the stored value is the index, `null` means it was never
 * recorded (which is not the same as 0, "not practising"). Append to the end
 * only — existing rows hold indexes, so reordering rewrites history.
 */
export const OBSERVANCE_LABELS = ["Not practising", "Cultural, in name only", "Occasionally practising", "Practising", "Devout"] as const;

/** The stored index as a label, for display and for anything the model reads. */
export function observanceLabel(level: number | null | undefined): string | null {
  return level == null ? null : (OBSERVANCE_LABELS[level] ?? null);
}
