import { describe, expect, it } from "vitest";
import { addMonths, nextOccurrenceAfter, nthOccurrence } from "../src/shared/recurrence";
import { describeRepeat } from "../src/shared/schemas/reminder";

describe("recurrence maths", () => {
  it("adds months with end-of-month clamping and no drift from the anchor", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    const monthly = { every: 1, unit: "month" } as const;
    expect([0, 1, 2, 3].map((n) => nthOccurrence("2026-01-31", monthly, n))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(nthOccurrence("2024-02-29", { every: 1, unit: "year" }, 1)).toBe("2025-02-28");
    expect(nthOccurrence("2024-02-29", { every: 1, unit: "year" }, 4)).toBe("2028-02-29");
  });

  it("finds the first occurrence strictly after a day", () => {
    const weekly = { every: 1, unit: "week" } as const;
    expect(nextOccurrenceAfter("2026-09-01", weekly, "2026-08-01")).toBe("2026-09-01"); // before the anchor: the anchor itself
    expect(nextOccurrenceAfter("2026-09-01", weekly, "2026-09-01")).toBe("2026-09-08"); // on an occurrence: the next one
    expect(nextOccurrenceAfter("2026-09-01", weekly, "2026-09-20")).toBe("2026-09-22"); // skips missed ones
    expect(nextOccurrenceAfter("2026-09-01", { every: 3, unit: "day" }, "2026-09-05")).toBe("2026-09-07");
    expect(nextOccurrenceAfter("2026-01-31", { every: 1, unit: "month" }, "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrenceAfter("2026-01-31", { every: 1, unit: "month" }, "2026-02-27")).toBe("2026-02-28");
    expect(nextOccurrenceAfter("2026-01-15", { every: 2, unit: "month" }, "2026-03-15")).toBe("2026-05-15");
    expect(nextOccurrenceAfter("2020-05-10", { every: 1, unit: "year" }, "2026-05-10")).toBe("2027-05-10");
    expect(nextOccurrenceAfter("2020-05-10", { every: 1, unit: "year" }, "2026-05-09")).toBe("2026-05-10");
  });

  it("stops at the end date", () => {
    expect(nextOccurrenceAfter("2026-09-01", { every: 1, unit: "week", until: "2026-09-15" }, "2026-09-08")).toBe("2026-09-15");
    expect(nextOccurrenceAfter("2026-09-01", { every: 1, unit: "week", until: "2026-09-15" }, "2026-09-15")).toBeNull();
    expect(nextOccurrenceAfter("2026-09-01", { every: 1, unit: "week", until: "2026-09-14" }, "2026-09-08")).toBeNull();
  });

  it("describes a rule", () => {
    expect(describeRepeat(null)).toBe("once");
    expect(describeRepeat({ every: 1, unit: "week" })).toBe("every week");
    expect(describeRepeat({ every: 2, unit: "month" })).toBe("every 2 months");
    expect(describeRepeat({ every: 1, unit: "year", until: "2030-01-01" })).toBe("every year until 2030-01-01");
    expect(describeRepeat({ every: 3, unit: "day", until: "2030-01-01" }, (d) => `[${d}]`)).toBe("every 3 days until [2030-01-01]");
  });
});
