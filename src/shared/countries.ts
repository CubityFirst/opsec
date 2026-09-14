import { COUNTRY_NAMES } from "./country-names";

/**
 * Suggestions for the country-of-origin field, and the flag shown beside one.
 * `contacts.origin_country` is free text and any value is accepted, so somewhere
 * that is not a country on this list ("Kurdistan", "Kashmir", "Yorkshire") is kept
 * exactly as typed and simply gets no flag.
 *
 * The names come from ICU (`npm run countries` regenerates `country-names.ts`).
 */
export const COUNTRY_SUGGESTIONS: string[] = Object.values(COUNTRY_NAMES);

/**
 * Assigned to a code by ISO but not part of the emoji flag set, so a regional
 * indicator pair renders as two letters in a box on most platforms. Better no flag
 * than a broken one. Kosovo (XK) is user-assigned and in the same boat.
 */
const NO_FLAG = new Set(["AC", "CP", "DG", "EA", "IC", "TA", "XK"]);

/** How people actually write it, when that is not ICU's name. */
const ALIASES: Record<string, string> = {
  america: "US",
  britain: "GB",
  burma: "MM",
  "cape verde islands": "CV",
  "czech republic": "CZ",
  "east timor": "TL",
  england: "GB-ENG",
  "great britain": "GB",
  holland: "NL",
  "hong kong": "HK",
  "ivory coast": "CI",
  korea: "KR",
  macao: "MO",
  macau: "MO",
  macedonia: "MK",
  "northern ireland": "GB-NIR",
  palestine: "PS",
  scotland: "GB-SCT",
  swaziland: "SZ",
  "the gambia": "GM",
  "the netherlands": "NL",
  uae: "AE",
  uk: "GB",
  usa: "US",
  "united states of america": "US",
  vatican: "VA",
  wales: "GB-WLS",
};

/** Lowercase, unaccented, straight apostrophes: "Côte d’Ivoire" and "cote d'ivoire" are the same answer. */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‘’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const BY_NAME: Record<string, string> = {};
/** Short forms ("Congo - Kinshasa" → "congo"), dropped when two countries would answer to one. */
const SHORT_FORMS: Record<string, string> = {};
const AMBIGUOUS = new Set<string>();
for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
  BY_NAME[normalise(name)] = code;
  BY_NAME[code.toLowerCase()] = code;
  const short = normalise(name.split(/ [-–(] | sar /i)[0]!);
  if (!short || short === normalise(name)) continue;
  if (short in SHORT_FORMS) AMBIGUOUS.add(short);
  else SHORT_FORMS[short] = code;
}
for (const key of AMBIGUOUS) delete SHORT_FORMS[key];

/** The ISO code a written-out country resolves to, or null when it is not a country we know. */
export function countryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = normalise(value);
  return ALIASES[key] ?? BY_NAME[key] ?? SHORT_FORMS[key] ?? null;
}

/**
 * The flag emoji for a country as the user wrote it, or null when there is none
 * to show. Two-letter codes become regional indicators; England, Scotland, Wales
 * and Northern Ireland have their own tag sequences.
 */
export function countryFlag(value: string | null | undefined): string | null {
  const code = countryCode(value);
  if (!code || NO_FLAG.has(code)) return null;
  if (code.includes("-")) {
    const [, subdivision] = code.toLowerCase().split("-");
    // 🏴 + "gb" + the subdivision, each character as a tag, closed by the cancel tag.
    const tags = [...`gb${subdivision}`].map((c) => String.fromCodePoint(0xe0000 + c.codePointAt(0)!));
    return `\u{1F3F4}${tags.join("")}\u{E007F}`;
  }
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
