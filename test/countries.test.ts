import { describe, expect, it } from "vitest";
import { COUNTRY_SUGGESTIONS, countryCode, countryFlag } from "@shared/countries";

describe("country flags", () => {
  it("turns a country into its regional-indicator flag", () => {
    expect(countryFlag("Italy")).toBe("\u{1F1EE}\u{1F1F9}");
    expect(countryFlag("United Kingdom")).toBe("\u{1F1EC}\u{1F1E7}");
    expect(countryFlag("Japan")).toBe("\u{1F1EF}\u{1F1F5}");
  });

  it("is forgiving about how the country was typed", () => {
    for (const written of ["italy", "  ITALY ", "IT"]) expect(countryCode(written)).toBe("IT");
    expect(countryCode("Cote d'Ivoire")).toBe("CI"); // accents and curly apostrophes normalise away
    expect(countryCode("Côte d’Ivoire")).toBe("CI");
    expect(countryCode("Hong Kong")).toBe("HK"); // ICU calls it "Hong Kong SAR China"
    expect(countryCode("Macao SAR China")).toBe("MO");
    expect(countryCode("Congo")).toBeNull(); // two Congos answer to it, so neither is guessed
  });

  it("knows the names people actually use", () => {
    expect(countryCode("UK")).toBe("GB");
    expect(countryCode("USA")).toBe("US");
    expect(countryCode("Holland")).toBe("NL");
    expect(countryCode("Burma")).toBe("MM");
  });

  it("gives England, Scotland and Wales their own tag-sequence flags", () => {
    expect(countryFlag("England")).toBe("\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}");
    expect(countryFlag("Scotland")).toBe("\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}");
    expect(countryFlag("Wales")).toBe("\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}");
  });

  it("shows no flag rather than a broken one", () => {
    expect(countryFlag("Kurdistan")).toBeNull(); // free text that is not a country
    expect(countryFlag("")).toBeNull();
    expect(countryFlag(null)).toBeNull();
    expect(countryFlag("Kosovo")).toBeNull(); // assigned, but has no emoji flag
    expect(countryFlag("Canary Islands")).toBeNull();
  });

  it("suggests every country exactly once, alphabetically", () => {
    expect(COUNTRY_SUGGESTIONS.length).toBeGreaterThan(200);
    expect(new Set(COUNTRY_SUGGESTIONS).size).toBe(COUNTRY_SUGGESTIONS.length);
    expect(COUNTRY_SUGGESTIONS).toContain("Italy");
    expect(COUNTRY_SUGGESTIONS).not.toContain("European Union");
    const sorted = [...COUNTRY_SUGGESTIONS].sort((a, b) => a.localeCompare(b, "en"));
    expect(COUNTRY_SUGGESTIONS).toEqual(sorted);
  });
});
