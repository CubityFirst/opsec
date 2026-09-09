import { describe, expect, it } from "vitest";
import { clockSentence, deploymentTimeZone, localClock } from "../src/worker/services/ask/prompt";

describe("Ask prompt clock", () => {
  it("reads the wall clock and offset in the user's zone, DST included", () => {
    // 08:00 UTC on a summer day is 09:00 BST; the same clock in January is GMT.
    expect(localClock(new Date("2026-09-09T08:00:00Z"), "Europe/London")).toEqual({ weekday: "Wednesday", clock: "2026-09-09 09:00", offset: "+01:00" });
    expect(localClock(new Date("2026-01-14T08:00:00Z"), "Europe/London")).toEqual({ weekday: "Wednesday", clock: "2026-01-14 08:00", offset: "+00:00" });
    // Negative and half-hour offsets, and a date change across the line.
    expect(localClock(new Date("2026-09-09T02:30:00Z"), "America/New_York")).toEqual({ weekday: "Tuesday", clock: "2026-09-08 22:30", offset: "-04:00" });
    expect(localClock(new Date("2026-09-09T08:00:00Z"), "Asia/Kolkata")).toEqual({ weekday: "Wednesday", clock: "2026-09-09 13:30", offset: "+05:30" });
  });

  it("phrases the sentence for a known and an unknown zone", () => {
    const now = new Date("2026-09-09T08:00:00Z");
    expect(clockSentence(now, "Europe/London")).toBe("The current time is Wednesday 2026-09-09 09:00 in the user's time zone, Europe/London (UTC+01:00); that is 2026-09-09 08:00 UTC.");
    expect(clockSentence(now)).toBe("The current time is Wednesday 2026-09-09 08:00 UTC; the user's time zone is unknown, so treat times they give as UTC.");
  });

  it("accepts only zones Intl knows from the TIMEZONE var", () => {
    expect(deploymentTimeZone({ TIMEZONE: " Europe/London " })).toBe("Europe/London");
    expect(deploymentTimeZone({ TIMEZONE: "Nowhere/Special" })).toBeUndefined();
    expect(deploymentTimeZone({})).toBeUndefined();
  });
});
