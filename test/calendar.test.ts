import { describe, expect, it } from "vitest";
import type { CalendarFeedOut } from "@shared/schemas/calendar";
import type { ApiTokenCreated } from "@shared/schemas/token";
import type { BetOut, GiftOut, LifeEventOut, ReminderOut } from "@shared/types";
import { SELF } from "cloudflare:test";
import { buildCalendar, escapeText, foldLine, repeatRule, yearlyRule } from "../src/worker/lib/ical";
import { api, apiAs, createContact, createInteraction, json } from "./helpers";

async function feed(sources: string[], name = "Test feed"): Promise<CalendarFeedOut> {
  const { status, body } = await json<CalendarFeedOut>("/api/calendar-feeds", { method: "POST", body: { name, sources } });
  if (status !== 201) throw new Error(`feed failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

/** Fetch the feed anonymously and unfold it so assertions can match whole properties. */
async function ics(key: string): Promise<{ status: number; text: string; res: Response }> {
  const res = await SELF.fetch(`http://opsec.test/calendar/${key}.ics`);
  const text = (await res.text()).replace(/\r\n[ \t]/g, "");
  return { status: res.status, text, res };
}

function eventBlocks(text: string): string[] {
  return text.split("BEGIN:VEVENT").slice(1).map((b) => b.split("END:VEVENT")[0]!);
}

describe("iCalendar helpers", () => {
  it("escapes text and folds long lines on byte boundaries", () => {
    expect(escapeText("a,b;c\\d\nline")).toBe("a\\,b\\;c\\\\d\\nline");
    expect(foldLine("short")).toBe("short");
    const long = "SUMMARY:" + "é".repeat(100);
    const folded = foldLine(long);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });

  it("writes recurrence rules that keep month-end semantics", () => {
    expect(repeatRule({ every: 1, unit: "day" }, "2026-01-05")).toBe("FREQ=DAILY");
    expect(repeatRule({ every: 2, unit: "week", until: "2026-12-31" }, "2026-01-05")).toBe("FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231");
    expect(repeatRule({ every: 1, unit: "month" }, "2026-01-15")).toBe("FREQ=MONTHLY;BYMONTHDAY=15");
    expect(repeatRule({ every: 1, unit: "month" }, "2026-01-31")).toBe("FREQ=MONTHLY;BYMONTHDAY=31,-1;BYSETPOS=1");
    expect(repeatRule({ every: 3, unit: "year" }, "2024-02-29")).toBe("FREQ=YEARLY;INTERVAL=3;BYMONTH=2;BYMONTHDAY=29,-1;BYSETPOS=1");
    expect(yearlyRule(7, 4)).toBe("FREQ=YEARLY;BYMONTH=7;BYMONTHDAY=4");
  });

  it("emits timed events in UTC and all-day events as dates", () => {
    const out = buildCalendar({
      name: "Cal",
      now: "2026-09-10T10:00:00.000Z",
      events: [
        { uid: "a@opsec", start: "2026-09-10T14:30:00+02:00", summary: "Timed" },
        { uid: "b@opsec", day: "2026-12-31", summary: "All day" },
      ],
    });
    expect(out).toContain("X-WR-CALNAME:Cal\r\n");
    expect(out).toContain("DTSTART:20260910T123000Z\r\nDTEND:20260910T133000Z\r\n");
    expect(out).toContain("DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\n");
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("calendar feeds", () => {
  it("serves the selected sources to anyone with the key, in UTC", async () => {
    const alice = await createContact({ firstName: "Cal", lastName: "Alice", birthday: "1990-03-04" });
    const bob = await createContact({ firstName: "Cal", lastName: "Bob", birthday: "--02-29" });
    const noBirthday = await createContact({ firstName: "Cal", lastName: "Nobody", birthday: "1990" });
    const past = await createInteraction([alice.id, bob.id], { occurredAt: "2026-01-02T09:30:00+01:00", summary: "Coffee, then; a walk", location: "Park" });
    const planned = await createInteraction([alice.id], { occurredAt: "2036-06-01T18:00:00Z", summary: "Dinner" });

    const reminder = await json<ReminderOut>("/api/reminders", { method: "POST", body: { contactId: alice.id, title: "Call about the flat", dueOn: "2026-10-31", repeat: { every: 1, unit: "month" } } });
    expect(reminder.status).toBe(201);
    const done = await json<ReminderOut>("/api/reminders", { method: "POST", body: { title: "Already done", dueOn: "2026-01-01" } });
    expect((await api(`/api/reminders/${done.body.id}/complete`, { method: "POST" })).status).toBe(200);

    const bet = await json<BetOut>(`/api/contacts/${bob.id}/bets`, { method: "POST", body: { prediction: "It rains", wager: "a pint", madeOn: "2026-09-01", reviewOn: "2026-09-20" } });
    expect(bet.status).toBe(201);
    const gift = await json<GiftOut>(`/api/contacts/${alice.id}/gifts`, { method: "POST", body: { name: "Book", status: "given", givenOn: "2026-03-04" } });
    expect(gift.status).toBe(201);
    const idea = await json<GiftOut>(`/api/contacts/${alice.id}/gifts`, { method: "POST", body: { name: "Only an idea", status: "idea" } });
    expect(idea.status).toBe(201);
    const life = await json<LifeEventOut>(`/api/contacts/${alice.id}/life-events`, { method: "POST", body: { category: "home_living", title: "Moved house", occurredOn: "2025-05-06" } });
    expect(life.status).toBe(201);
    const vague = await json<LifeEventOut>(`/api/contacts/${alice.id}/life-events`, { method: "POST", body: { category: "home_living", title: "Some year", occurredOn: "2020" } });
    expect(vague.status).toBe(201);

    const everything = await feed(["interactions", "reminders", "birthdays", "life_events", "bets", "gifts"], "Everything, really");
    expect(everything.key).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(everything.sources).toEqual(["interactions", "reminders", "birthdays", "life_events", "bets", "gifts"]);

    const { status, text, res } = await ics(everything.key);
    expect(status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(text).toContain("X-WR-CALNAME:Everything\\, really");
    expect(text).toContain("X-WR-TIMEZONE:UTC");

    const blocks = eventBlocks(text);
    const by = (uid: string) => blocks.find((b) => b.includes(`UID:${uid}@opsec`));

    const pastBlock = by(`interaction-${past.id}`)!;
    expect(pastBlock).toContain("DTSTART:20260102T083000Z");
    expect(pastBlock).toContain("DTEND:20260102T093000Z");
    expect(pastBlock).toContain("SUMMARY:Coffee\\, then\\; a walk · Cal Alice\\, Cal Bob");
    expect(pastBlock).toContain("LOCATION:Park");
    expect(pastBlock).toContain(`URL:http://opsec.test/interactions/${past.id}`);
    expect(by(`interaction-${planned.id}`)).toContain("DTSTART:20360601T180000Z");

    const remBlock = by(`reminder-${reminder.body.id}`)!;
    expect(remBlock).toContain("DTSTART;VALUE=DATE:20261031");
    expect(remBlock).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=31,-1;BYSETPOS=1");
    expect(remBlock).toContain("SUMMARY:Call about the flat · Cal Alice");
    expect(by(`reminder-${done.body.id}`)).toBeUndefined();

    expect(by(`birthday-${alice.id}`)).toContain("DTSTART;VALUE=DATE:19900304");
    expect(by(`birthday-${alice.id}`)).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=4");
    expect(by(`birthday-${alice.id}`)).toContain("SUMMARY:Cal Alice's birthday");
    expect(by(`birthday-${bob.id}`)).toContain("DTSTART;VALUE=DATE:19720229");
    expect(by(`birthday-${bob.id}`)).toContain("RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29,-1;BYSETPOS=1");
    expect(by(`birthday-${noBirthday.id}`)).toBeUndefined();

    expect(by(`bet-${bet.body.id}`)).toContain("DTSTART;VALUE=DATE:20260920");
    expect(by(`bet-${bet.body.id}`)).toContain("SUMMARY:Bet with Cal Bob: It rains");
    expect(by(`gift-${gift.body.id}`)).toContain("SUMMARY:Gift for Cal Alice: Book");
    expect(by(`gift-${idea.body.id}`)).toBeUndefined();
    expect(by(`life-event-${life.body.id}`)).toContain("DTSTART;VALUE=DATE:20250506");
    expect(by(`life-event-${vague.body.id}`)).toBeUndefined();

    // A feed with only reminders carries nothing else.
    const onlyReminders = await feed(["reminders"]);
    const narrow = await ics(onlyReminders.key);
    expect(narrow.text).toContain(`UID:reminder-${reminder.body.id}@opsec`);
    expect(narrow.text).not.toContain("UID:interaction-");
    expect(narrow.text).not.toContain("UID:birthday-");

    // Deceased and archived people drop out of the birthday list.
    expect((await api(`/api/contacts/${bob.id}/deceased`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(200);
    expect((await ics(everything.key)).text).not.toContain(`UID:birthday-${bob.id}@opsec`);
  });

  it("lists, edits, rotates and deletes feeds; keys are the only credential", async () => {
    const f = await feed(["birthdays"], "Family");
    const list = await json<{ items: CalendarFeedOut[] }>("/api/calendar-feeds");
    expect(list.body.items.find((x) => x.id === f.id)).toMatchObject({ name: "Family", sources: ["birthdays"], lastFetchedAt: null });

    expect((await ics(f.key)).status).toBe(200);
    const after = await json<{ items: CalendarFeedOut[] }>("/api/calendar-feeds");
    expect(after.body.items.find((x) => x.id === f.id)!.lastFetchedAt).not.toBeNull();

    const edited = await json<CalendarFeedOut>(`/api/calendar-feeds/${f.id}`, { method: "PATCH", body: { name: "Family & pets", sources: ["reminders", "birthdays"] } });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: "Family & pets", sources: ["reminders", "birthdays"], key: f.key });
    expect((await json(`/api/calendar-feeds/${f.id}`, { method: "PATCH", body: { sources: [] } })).status).toBe(400);
    expect((await json(`/api/calendar-feeds/${f.id}`, { method: "PATCH", body: { sources: ["nope"] } })).status).toBe(400);

    const rotated = await json<CalendarFeedOut>(`/api/calendar-feeds/${f.id}/rotate`, { method: "POST" });
    expect(rotated.status).toBe(200);
    expect(rotated.body.key).not.toBe(f.key);
    expect((await ics(f.key)).status).toBe(404);
    expect((await ics(rotated.body.key)).status).toBe(200);

    expect((await ics("nope")).status).toBe(404);
    expect((await ics("x".repeat(43))).status).toBe(404);
    expect((await SELF.fetch(`http://opsec.test/calendar/${rotated.body.key}.txt`)).status).toBe(404);

    expect((await api(`/api/calendar-feeds/${f.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await ics(rotated.body.key)).status).toBe(404);
    expect((await api(`/api/calendar-feeds/${f.id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("is per user and never managed with an API token", async () => {
    const mine = await feed(["bets"], "Mine");
    const theirs = await apiAs({ sub: "someone-else", roles: ["admin"] }, "/api/calendar-feeds");
    expect(((await theirs.json()) as { items: CalendarFeedOut[] }).items.find((x) => x.id === mine.id)).toBeUndefined();
    expect((await apiAs({ sub: "someone-else", roles: ["admin"] }, `/api/calendar-feeds/${mine.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await api("/api/calendar-feeds", { anonymous: true })).status).toBe(401);

    const token = await json<ApiTokenCreated>("/api/tokens", { method: "POST", body: { name: "cal", scope: "write" } });
    const viaToken = await SELF.fetch("http://opsec.test/api/calendar-feeds", { headers: { authorization: `Bearer ${token.body.token}` } });
    expect(viaToken.status).toBe(403);
  });
});
