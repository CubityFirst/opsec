import type OpenAI from "openai";
import { z } from "zod";
import { BET_STATUSES } from "@shared/schemas/bet";
import { CONTACT_KINDS, INTERACTION_TYPES, idSchema, isoDateSchema, isoDateTimeSchema, nonBlank, optionalText } from "@shared/schemas/common";
import { interactionCreateSchema } from "@shared/schemas/interaction";

import { newId } from "../../lib/ids";
import { listBets } from "../bets";
import { getContactDetail, getContactRow, listContacts } from "../contacts";
import { contactFeed } from "../feed";
import { getInteractionOut, listContactInteractions, searchInteractions } from "../interactions";
import { listLifeEvents } from "../life-events";
import { listRelationshipsFor } from "../relationships";
import { BODY_PREVIEW_CHARS, MAX_TOOL_RESULT_BYTES, NOTES_SUMMARY_CHARS } from "./limits";
import { compactBet, compactContact, compactInteraction, compactLifeEvent, describeFeedItem, ref, truncate } from "./compact";
import { PROPOSAL_TOOLS, resolveRefs } from "./proposals";
import { AskToolError, def, type ToolCtx, type ToolDef } from "./tool-def";

// This module is read-only by construction: it never imports lib/batch or any
// insert/update path. Proposals only emit events for the UI to act on.

export { AskToolError, type ToolCtx } from "./tool-def";

const searchContacts = def({
  name: "search_contacts",
  description:
    "Find contacts (people, pets, organisations) by any name, nickname, other name (e.g. a Chinese or maiden name), phone, email, social handle or tag. Returns compact summaries with ids. Use the id with get_contact / list_interactions.",
  schema: z.object({
    q: z.string().max(200).optional().describe("Search text; matches names, nicknames, other names, contact methods and tags"),
    kind: z.enum(CONTACT_KINDS).optional(),
    tag: z.string().max(50).optional().describe("Exact tag name"),
    includeArchived: z.boolean().optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  label: (i) => (i.q ? `Searching contacts for “${i.q}”` : i.tag ? `Listing contacts tagged “${i.tag}”` : "Listing contacts"),
  run: async (i, ctx) => {
    const limit = i.limit ?? 10;
    const base = { q: i.q, kind: i.kind, tag: i.tag, sort: "name" as const, limit, offset: 0 };
    const active = await listContacts(ctx.db, { ...base, archived: false, deceased: false });
    let items = active.items;
    let total = active.total;
    // Deceased contacts are always searchable: "when did Rex die" must still resolve.
    const deceased = await listContacts(ctx.db, { ...base, archived: false, deceased: true });
    items = [...items, ...deceased.items];
    total += deceased.total;
    if (i.includeArchived) {
      const archived = await listContacts(ctx.db, { ...base, archived: true, deceased: false });
      items = [...items, ...archived.items];
      total += archived.total;
    }
    return { total, items: items.slice(0, limit).map(compactContact) };
  },
});

const getContact = def({
  name: "get_contact",
  description:
    "Everything about one contact: names, contact methods, tags, how we met (metOn/metWhere/metHow/metVia), job and employer, notes, custom fields, relationships (typeLabel is the OTHER contact's role relative to this contact), recent interactions and life events.",
  schema: z.object({
    id: idSchema,
    notes: z.enum(["summary", "full"]).optional().describe("summary (default) truncates long notes"),
    recentInteractions: z.number().int().min(0).max(10).optional().describe("How many recent interactions to include (default 5)"),
  }),
  label: () => "Reading a contact’s record",
  run: async (i, ctx) => {
    const d = await getContactDetail(ctx.db, i.id);
    const n = i.recentInteractions ?? 5;
    const [rels, recent, life] = await Promise.all([
      listRelationshipsFor(ctx.db, i.id),
      n > 0 ? listContactInteractions(ctx.db, i.id, { limit: n }) : Promise.resolve({ items: [], total: 0 }),
      listLifeEvents(ctx.db, i.id),
    ]);
    return {
      ...compactContact(d),
      methods: d.methods.map((m) => ({ id: m.id, type: m.type, label: m.label, value: m.value, primary: m.isPrimary || undefined })),
      met: d.metOn || d.metWhere || d.metHow || d.metVia ? { on: d.metOn, where: d.metWhere, how: d.metHow, via: d.metVia ? ref(d.metVia) : null } : null,
      notes: i.notes === "full" ? d.notes : truncate(d.notes, NOTES_SUMMARY_CHARS, "call get_contact with notes: \"full\""),
      customFields: Object.keys(d.customFields).length ? d.customFields : undefined,
      relationships: rels.map((r) => ({
        id: r.id,
        otherContact: ref(r.otherContact),
        role: r.typeLabel,
        category: r.category,
        label: r.label ?? undefined,
        since: r.startedAt ?? undefined,
        until: r.endedAt ?? undefined,
      })),
      recentInteractions: { total: recent.total, items: recent.items.map((x) => compactInteraction(x, 300)) },
      lifeEvents: life.map((l) => compactLifeEvent(l, 200)),
    };
  },
});

const listInteractionsTool = def({
  name: "list_interactions",
  description:
    "Interactions (calls, texts, meetings, meals, notes…) newest first. Filter by participant contactId, free text over summary/body/location, type, and an ISO date window. Use for 'when did I last…', 'what did we talk about', or to find a conversation about a topic.",
  schema: z.object({
    contactId: idSchema.optional(),
    q: z.string().max(200).optional(),
    type: z.enum(INTERACTION_TYPES).optional(),
    since: isoDateTimeSchema.optional(),
    until: isoDateTimeSchema.optional(),
    limit: z.number().int().min(1).max(25).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  label: (i) => (i.q ? `Searching interactions for “${i.q}”` : i.contactId ? "Listing a contact’s interactions" : "Listing interactions"),
  run: async (i, ctx) => {
    const r = await searchInteractions(ctx.db, { ...i, limit: i.limit ?? 10 });
    return { total: r.total, items: r.items.map((x) => compactInteraction(x, BODY_PREVIEW_CHARS)) };
  },
});

const getInteraction = def({
  name: "get_interaction",
  description: "One interaction in full: complete body, all participants, attachment names.",
  schema: z.object({ id: idSchema }),
  label: () => "Reading an interaction",
  run: async (i, ctx) => {
    const x = await getInteractionOut(ctx.db, i.id);
    return { ...compactInteraction(x, 20_000), body: x.body };
  },
});

const getActivity = def({
  name: "get_activity",
  description: "A contact's change history and timeline as one line per item (tags, relationships, edits, interactions, life events), newest first. Good for 'what changed' and 'when did I add…' questions.",
  schema: z.object({
    contactId: idSchema,
    limit: z.number().int().min(1).max(30).optional(),
    before: isoDateTimeSchema.optional().describe("Page older than this timestamp (use nextBefore from a previous call)"),
  }),
  label: () => "Reading a contact’s activity",
  run: async (i, ctx) => {
    const feed = await contactFeed(ctx.db, i.contactId, { limit: i.limit ?? 15, before: i.before });
    return { items: feed.items.map(describeFeedItem), nextBefore: feed.nextBefore };
  },
});

const listLifeEventsTool = def({
  name: "list_life_events",
  description: "Life events of a contact (work & education, family & relationships, home & living, health & wellness, travel & experiences), newest first.",
  schema: z.object({ contactId: idSchema }),
  label: () => "Listing life events",
  run: async (i, ctx) => (await listLifeEvents(ctx.db, i.contactId)).map((l) => compactLifeEvent(l, 400)),
});

const listBetsTool = def({
  name: "list_bets",
  description:
    "Bets (friendly wagers) with contacts: the user's prediction, the wager, the day it was made, the reviewOn date when the result is due, and for settled ones the outcome (me = the user's prediction held, them = the contact was right, void) and how it fell. Open bets come first, soonest review date on top. Filter by contactId, status, or dueBy (open bets whose review date is on or before that day: use today's date for 'what needs settling').",
  schema: z.object({
    contactId: idSchema.optional(),
    status: z.enum(BET_STATUSES).optional(),
    dueBy: isoDateSchema.optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  label: (i) => (i.contactId ? "Listing a contact’s bets" : i.dueBy ? "Listing bets due for review" : "Listing bets"),
  run: async (i, ctx) => {
    const r = await listBets(ctx.db, { status: i.status, dueBy: i.dueBy, limit: i.limit ?? 20, offset: 0 }, { contactId: i.contactId });
    return { total: r.total, record: r.record, items: r.items.map((b) => compactBet(b, 400)) };
  },
});

const proposeInteraction = def({
  name: "propose_interaction",
  description:
    "Draft an interaction to log (a call, text, meeting, meal, note…) when the user asks to record something or a screenshot shows an exchange worth logging. The draft is shown to the user with an Apply button; nothing is saved by you. Write the summary as one line and the body in the user's voice, mentioning people as [@Name](/contacts/<id>).",
  schema: z.object({
    contactIds: z.array(idSchema).min(1).max(20),
    type: z.enum(INTERACTION_TYPES),
    occurredAt: isoDateTimeSchema.optional().describe("When it happened, ISO-8601 UTC. Omit when the user gave no time: it defaults to right now."),
    summary: nonBlank(500),
    body: optionalText(20_000),
    location: optionalText(500),
  }),
  label: () => "Drafting an interaction for you to review",
  run: async (i, ctx) => {
    const ids = [...new Set(i.contactIds)];
    const { refs, dependsOn } = await resolveRefs(ctx, ids);
    const input = interactionCreateSchema.parse({ ...i, occurredAt: i.occurredAt ?? new Date().toISOString(), contactIds: ids });
    ctx.emit({ type: "proposal", proposal: { kind: "interaction", id: newId(), input, participants: ids.map((x) => refs.get(x)!), dependsOn: dependsOn.length ? dependsOn : undefined } });
    return "The draft is now shown to the user with an Apply button. Continue with any further proposals the request needs, then summarise in one sentence; do not repeat its full text and do not say it was saved.";
  },
});

const proposeContactNote = def({
  name: "propose_contact_note",
  description: "Draft text to append to a contact's notes. Shown to the user with an Apply button; nothing is saved by you.",
  schema: z.object({ contactId: idSchema, appendText: nonBlank(5000) }),
  label: () => "Drafting a note for you to review",
  run: async (i, ctx) => {
    const row = await getContactRow(ctx.db, i.contactId);
    ctx.emit({
      type: "proposal",
      proposal: { kind: "contact_note", id: newId(), contact: { id: row.id, kind: row.kind, displayName: row.displayName, avatarUrl: null, deceased: !!row.deceasedAt }, appendText: i.appendText },
    });
    return "The note draft is now shown to the user with an Apply button. Summarise it in one sentence and stop; do not say it was saved.";
  },
});

/** Fixed order: the tool list is part of the prompt prefix. */
export const TOOLS: ToolDef<z.ZodObject>[] = [searchContacts, getContact, listInteractionsTool, getInteraction, getActivity, listLifeEventsTool, listBetsTool, proposeInteraction, proposeContactNote, ...PROPOSAL_TOOLS];

export function toolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return TOOLS.map((t) => {
    // Input-side schema (transforms only affect output); drop `$schema`, which some providers reject.
    const { $schema: _, ...parameters } = z.toJSONSchema(t.schema, { io: "input", unrepresentable: "any" });
    return { type: "function", function: { name: t.name, description: t.description, parameters } };
  });
}

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON string from the model. */
  argsJson: string;
}

export interface ToolOutcome {
  id: string;
  ok: boolean;
  /** What goes back to the model. */
  content: string;
  /** Short human line for the trail. */
  summary: string;
  bytes: number;
}

function summarise(result: unknown): string {
  if (typeof result === "string") return result.length > 80 ? `${result.slice(0, 77)}…` : result;
  if (Array.isArray(result)) return `${result.length} item${result.length === 1 ? "" : "s"}`;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.items)) return `${r.items.length} of ${typeof r.total === "number" ? r.total : r.items.length} item${r.items.length === 1 ? "" : "s"}`;
    if (typeof r.name === "string") return r.name;
  }
  return "ok";
}

/** Validate, run, and package one tool call. Never throws: failures become `is_error` results for the model. */
export async function executeTool(call: ToolCall, ctx: ToolCtx): Promise<ToolOutcome> {
  const tool = TOOLS.find((t) => t.name === call.name);
  const fail = (message: string): ToolOutcome => ({ id: call.id, ok: false, content: JSON.stringify({ error: message }), summary: message, bytes: message.length });
  if (!tool) return fail(`Unknown tool "${call.name}"`);

  let parsedArgs: unknown;
  try {
    parsedArgs = call.argsJson.trim() ? JSON.parse(call.argsJson) : {};
  } catch {
    return fail("Arguments were not valid JSON");
  }
  const parsed = tool.schema.safeParse(parsedArgs);
  if (!parsed.success) return fail(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`);

  ctx.emit({ type: "tool_call", id: call.id, name: tool.name, label: tool.label(parsed.data), input: parsed.data });
  if (ctx.budget.exhausted) return fail("Tool budget exhausted; answer with what you already have.");

  try {
    const result = await tool.run(parsed.data, ctx);
    let content = typeof result === "string" ? result : JSON.stringify(result);
    if (content.length > MAX_TOOL_RESULT_BYTES) {
      content = `${content.slice(0, MAX_TOOL_RESULT_BYTES)}…[result truncated at ${MAX_TOOL_RESULT_BYTES} chars; narrow the query or page with offset]`;
    }
    ctx.budget.spend(content.length);
    return { id: call.id, ok: true, content, summary: summarise(result), bytes: content.length };
  } catch (e) {
    const message = e instanceof AskToolError ? e.message : e instanceof Error && "status" in e && (e as { status?: number }).status === 404 ? "Not found" : "Tool failed";
    return fail(message);
  }
}
