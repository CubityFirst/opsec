import { z } from "zod";
import { nonBlank } from "./common";

/**
 * What an iCalendar feed can carry. Each feed picks any subset, so one can be
 * "reminders and birthdays" for a shared family calendar and another the full
 * interaction history for the owner's own.
 */
export const CALENDAR_SOURCES = ["interactions", "reminders", "birthdays", "life_events", "bets", "gifts"] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];
export const calendarSourceSchema = z.enum(CALENDAR_SOURCES);

export const CALENDAR_SOURCE_LABELS: Record<CalendarSource, { label: string; hint: string }> = {
  interactions: { label: "Interactions", hint: "Every logged call, meal, meeting… past and planned, as one-hour events" },
  reminders: { label: "Reminders", hint: "Open reminders as all-day events; recurring ones repeat in the calendar" },
  birthdays: { label: "Birthdays", hint: "Yearly all-day events for people and pets with a known month and day" },
  life_events: { label: "Life events", hint: "Milestones with a full date, as all-day events" },
  bets: { label: "Bets", hint: "Review dates of open bets, as all-day events" },
  gifts: { label: "Gifts", hint: "The day a gift was given or received, as all-day events" },
};

const sourcesField = z.array(calendarSourceSchema).min(1).max(CALENDAR_SOURCES.length).transform((s) => CALENDAR_SOURCES.filter((k) => s.includes(k)));

export const calendarFeedCreateSchema = z.object({
  name: nonBlank(60),
  sources: sourcesField,
});
export type CalendarFeedCreateInput = z.infer<typeof calendarFeedCreateSchema>;

export const calendarFeedUpdateSchema = z.object({
  name: nonBlank(60).optional(),
  sources: sourcesField.optional(),
});
export type CalendarFeedUpdateInput = z.infer<typeof calendarFeedUpdateSchema>;

export interface CalendarFeedOut {
  id: string;
  name: string;
  sources: CalendarSource[];
  /** Secret path segment of the subscription URL: `/calendar/<key>.ics`. */
  key: string;
  createdAt: string;
  updatedAt: string;
  lastFetchedAt: string | null;
}
