import type { BetOut, ContactRef, ContactSummary, FeedItem, InteractionOut, LifeEventOut } from "@shared/types";

/** Cut text to `max` chars, telling the model how to get the rest. */
export function truncate(text: string | null | undefined, max: number, hint = ""): string | null {
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…[truncated; ${text.length} chars total${hint ? `; ${hint}` : ""}]`;
}

export function ref(c: ContactRef) {
  return { id: c.id, name: c.displayName, kind: c.kind };
}

export function compactContact(c: ContactSummary) {
  return {
    id: c.id,
    kind: c.kind,
    name: c.displayName,
    nickname: c.nickname,
    pronouns: c.pronouns ?? undefined,
    animalType: c.animalType ?? undefined,
    otherNames: c.otherNames.length ? c.otherNames : undefined,
    tags: c.tags.map((t) => t.name),
    jobTitle: c.jobTitle,
    employer: c.employer ? ref(c.employer) : undefined,
    birthday: c.birthday,
    primaryEmail: c.primaryEmail,
    primaryPhone: c.primaryPhone,
    lastInteraction: c.lastInteraction ? { occurredAt: c.lastInteraction.occurredAt, type: c.lastInteraction.type, summary: c.lastInteraction.summary } : null,
    archived: c.archivedAt ? true : undefined,
  };
}

export function compactInteraction(i: InteractionOut, bodyChars: number) {
  return {
    id: i.id,
    type: i.type,
    occurredAt: i.occurredAt,
    summary: i.summary,
    location: i.location ?? undefined,
    participants: i.participants.map(ref),
    body: truncate(i.body, bodyChars, "call get_interaction for the full text"),
    attachments: i.attachments.length ? i.attachments.map((a) => a.filename) : undefined,
  };
}

export function compactLifeEvent(l: LifeEventOut, bodyChars: number) {
  return { id: l.id, category: l.category, title: l.title, occurredOn: l.occurredOn, body: truncate(l.body, bodyChars) };
}

export function compactBet(b: BetOut, detailChars: number) {
  return {
    id: b.id,
    with: ref(b.contact),
    prediction: b.prediction,
    wager: b.wager ?? undefined,
    madeOn: b.madeOn,
    reviewOn: b.reviewOn,
    status: b.status,
    outcome: b.outcome ?? undefined,
    settledAt: b.settledAt ?? undefined,
    settledNote: b.settledNote ?? undefined,
    details: truncate(b.details, detailChars) ?? undefined,
  };
}

const str = (p: Record<string, unknown>, k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");

/** One line per feed item, for the activity tool. */
export function describeFeedItem(item: FeedItem): { at: string; kind: string; line: string } {
  if (item.kind === "interaction") {
    const i = item.interaction;
    return { at: item.at, kind: "interaction", line: `${i.type}: ${i.summary} (with ${i.participants.map((p) => p.displayName).join(", ") || "nobody else"}) [id ${i.id}]` };
  }
  if (item.kind === "lifeEvent") {
    const l = item.lifeEvent;
    return { at: item.at, kind: "life_event", line: `${l.category}: ${l.title} [id ${l.id}]` };
  }
  const e = item.event;
  const p = e.payload;
  let line: string;
  switch (e.eventType) {
    case "contact.created":
      line = "contact created";
      break;
    case "contact.updated":
      line = `updated ${Object.keys((p.changes as Record<string, unknown>) ?? {}).join(", ")}`;
      break;
    case "tag.added":
    case "tag.removed":
      line = `${e.eventType}: ${str(p, "name")}`;
      break;
    case "relationship.added":
    case "relationship.removed":
      line = `${e.eventType}: ${str(p, "otherDisplayName")} as ${str(p, "typeLabel")}${str(p, "label") ? ` (${str(p, "label")})` : ""}`;
      break;
    case "interaction.mentioned":
      line = `mentioned in ${str(p, "type")}: ${str(p, "summary")} [id ${e.entityId}]`;
      break;
    case "interaction.updated":
    case "interaction.deleted":
      line = `${e.eventType}: ${str(p, "summary")}`;
      break;
    case "life_event.updated":
    case "life_event.deleted":
      line = `${e.eventType}: ${str(p, "title")}`;
      break;
    case "bet.created":
      line = `bet made: "${str(p, "prediction")}"${str(p, "wager") ? ` for ${str(p, "wager")}` : ""}, review on ${str(p, "reviewOn")} [id ${e.entityId}]`;
      break;
    case "bet.settled":
      line = `bet settled (${str(p, "outcome") === "me" ? "I was right" : str(p, "outcome") === "them" ? "they were right" : "void"}): "${str(p, "prediction")}"${str(p, "note") ? ` — ${str(p, "note")}` : ""} [id ${e.entityId}]`;
      break;
    case "bet.updated":
    case "bet.reopened":
    case "bet.deleted":
      line = `${e.eventType}: "${str(p, "prediction")}"`;
      break;
    case "file.uploaded":
    case "file.deleted":
      line = `${e.eventType}: ${str(p, "filename")}`;
      break;
    default:
      line = e.eventType;
  }
  return { at: item.at, kind: "event", line };
}
