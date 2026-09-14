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
