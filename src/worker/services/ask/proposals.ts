/**
 * Write-shaped Ask tools. Every one of them only *proposes*: it validates the
 * change against current data, then emits an "action" proposal carrying the
 * exact API request the browser will send when the user presses Apply. This
 * module never writes to the database.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { pendingIdFor, type AskProposal } from "@shared/schemas/ask";
import { CONTACT_KINDS, INTERACTION_TYPES, birthdaySchema, contactMethodTypeSchema, idSchema, isoDateSchema, isoDateTimeSchema, nonBlank } from "@shared/schemas/common";
import { contactCreateSchema, contactMethodInputSchema, customFieldsSchema, otherNameSchema } from "@shared/schemas/contact";
import { LIFE_EVENT_CATEGORIES, LIFE_EVENT_CATEGORY_LABELS, lifeEventCreateSchema } from "@shared/schemas/life-event";
import { BET_OUTCOME_LABELS, betCreateSchema, betOutcomeSchema } from "@shared/schemas/bet";
import type { ContactDetail, ContactRef } from "@shared/types";
import { schema } from "../../db";
import { newId } from "../../lib/ids";
import { contactRefs, getContactDetail } from "../contacts";
import { assertEmployer } from "../employment";
import { getInteractionOut } from "../interactions";
import { AskToolError, def, type ToolCtx } from "./tool-def";

type ActionProposal = Extract<AskProposal, { kind: "action" }>;
type Change = ActionProposal["changes"][number];

const ID_LIST_MAX = 50;
const text = (max: number) => z.string().trim().max(max).nullable().optional();

function emitAction(ctx: ToolCtx, p: Omit<ActionProposal, "kind" | "id"> & { id?: string }): string {
  const id = p.id ?? newId();
  const dependsOn = p.dependsOn?.length ? [...new Set(p.dependsOn)] : undefined;
  ctx.emit({ type: "proposal", proposal: { kind: "action", ...p, id, dependsOn } });
  return `The proposal “${p.title}” is now shown to the user with an Apply button${dependsOn ? " (it will wait for the proposals it depends on)" : ""}. Continue with any further proposals the request needs, then summarise in one sentence; do not say anything was saved.`;
}

/**
 * Contact refs for ids that may be real or `new:<proposalId>` placeholders from
 * an earlier propose_contact_create in this reply. Returns the proposal ids the
 * caller now depends on.
 */
export async function resolveRefs(ctx: ToolCtx, ids: string[]): Promise<{ refs: Map<string, ContactRef>; dependsOn: string[] }> {
  const unique = [...new Set(ids)];
  const refs = new Map<string, ContactRef>();
  const dependsOn: string[] = [];
  const real: string[] = [];
  for (const id of unique) {
    const p = ctx.pending.get(id);
    if (p) {
      refs.set(id, p.ref);
      dependsOn.push(p.proposalId);
    } else if (id.startsWith("new:")) {
      throw new AskToolError(`Unknown placeholder id ${id}: it must come from a propose_contact_create call in this same reply`);
    } else real.push(id);
  }
  if (real.length) {
    const found = await contactRefs(ctx.db, real);
    const missing = real.filter((x) => !found.has(x));
    if (missing.length > 0) throw new AskToolError(`Unknown contact id(s): ${missing.join(", ")}`);
    for (const [k, v] of found) refs.set(k, v);
  }
  return { refs, dependsOn };
}

/** Current detail for a real contact, or just a ref (detail null) for a pending one. */
async function contactOrPending(ctx: ToolCtx, id: string): Promise<{ detail: ContactDetail | null; ref: ContactRef; dependsOn: string[] }> {
  const p = ctx.pending.get(id);
  if (p) return { detail: null, ref: p.ref, dependsOn: [p.proposalId] };
  const detail = await getContactDetail(ctx.db, id);
  return { detail, ref: toRef(detail), dependsOn: [] };
}

function toRef(c: Pick<ContactRef, "id" | "kind" | "displayName" | "avatarUrl">): ContactRef {
  return { id: c.id, kind: c.kind, displayName: c.displayName, avatarUrl: c.avatarUrl };
}

function show(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** "" from the model means clear; undefined means untouched. */
function norm(v: string | null | undefined): string | null | undefined {
  return v === undefined ? undefined : v?.trim() ? v.trim() : null;
}


async function checkEmployer(ctx: ToolCtx, personId: string, employerId: string | null | undefined) {
  if (!employerId) return;
  const p = ctx.pending.get(employerId);
  if (p) {
    if (p.ref.kind !== "organization") throw new AskToolError("Place of work must be an organisation contact");
    return;
  }
  if (employerId.startsWith("new:")) throw new AskToolError(`Unknown placeholder id ${employerId}: it must come from a propose_contact_create call in this same reply`);
  try {
    await assertEmployer(ctx.db, personId, employerId);
  } catch (e) {
    throw new AskToolError(e instanceof Error ? e.message : "Invalid employer");
  }
}

// ---------------------------------------------------------------------------
// Contacts

const CONTACT_FIELD_LABELS = {
  firstName: "First name",
  lastName: "Last name",
  nickname: "Nickname",
  pronouns: "Pronouns",
  animalType: "Animal type",
  otherNames: "Other names",
  birthday: "Birthday",
  metOn: "Met on",
  metWhere: "Met where",
  metHow: "How we met",
  metViaContactId: "Met via",
  jobTitle: "Job title",
  employerContactId: "Employer",
} as const;

const contactFieldsForUpdate = {
  firstName: z.string().trim().min(1).max(200).optional(),
  lastName: text(200),
  nickname: text(200),
  pronouns: text(40),
  animalType: text(100).describe("Pets only: species or breed"),
  otherNames: z.array(otherNameSchema).max(20).optional().describe("Replaces the whole list"),
  birthday: birthdaySchema.nullable().optional(),
  metOn: birthdaySchema.nullable().optional(),
  metWhere: text(200),
  metHow: text(2000),
  metViaContactId: idSchema.nullable().optional().describe("Contact who introduced the user, or through whom they know this contact"),
  jobTitle: text(200),
  employerContactId: idSchema.nullable().optional().describe("Must be an existing organisation contact"),
  customFields: customFieldsSchema.optional().describe("Merged into the existing custom fields; a null value removes that key"),
};

const proposeContactUpdate = def({
  name: "propose_contact_update",
  description:
    "Draft changes to a contact's names, pronouns, other names, birthday, how-we-met details, job title, employer or custom fields. Shown to the user as a before/after with an Apply button; nothing is saved by you. Pass only the fields that change; pass null (or \"\") to clear one. Dates use the partial format (YYYY-MM-DD, YYYY-MM, YYYY, --MM-DD, --MM). employerContactId must be an existing organisation: search_contacts with kind=organization first and, if it is not in the CRM, propose_contact_create it or say so. To change notes use propose_contact_note; for tags use propose_tags; for phones/emails use propose_contact_method.",
  schema: z.object({ contactId: idSchema, ...contactFieldsForUpdate }),
  label: () => "Drafting a contact update for you to review",
  run: async (i, ctx) => {
    const d = await getContactDetail(ctx.db, i.contactId);
    const body: Record<string, unknown> = {};
    const changes: Change[] = [];
    const isPerson = d.kind === "person";

    const simple: (keyof typeof CONTACT_FIELD_LABELS & keyof ContactDetail)[] = ["firstName", "lastName", "nickname", "pronouns", "animalType", "birthday", "metOn", "metWhere", "metHow", "jobTitle"];
    for (const f of simple) {
      const raw = i[f as keyof typeof i] as string | null | undefined;
      const next = f === "firstName" ? (raw as string | undefined) : norm(raw);
      if (next === undefined) continue;
      if ((f === "pronouns" || f === "jobTitle") && !isPerson) throw new AskToolError(`Only people have a ${CONTACT_FIELD_LABELS[f].toLowerCase()}`);
      if (f === "animalType" && d.kind !== "pet") throw new AskToolError("Only pets have an animal type");
      if (next === (d[f] ?? null)) continue;
      body[f] = next;
      changes.push({ label: CONTACT_FIELD_LABELS[f], from: show(d[f]), to: show(next) });
    }
    if (i.otherNames !== undefined) {
      const fmt = (list: { label: string; value: string }[]) => (list.length ? list.map((n) => `${n.value} (${n.label})`).join("; ") : null);
      if (JSON.stringify(i.otherNames) !== JSON.stringify(d.otherNames)) {
        body.otherNames = i.otherNames;
        changes.push({ label: "Other names", from: fmt(d.otherNames), to: fmt(i.otherNames) });
      }
    }
    const dependsOn: string[] = [];
    if (i.metViaContactId !== undefined) {
      let to: ContactRef | null = null;
      if (i.metViaContactId) {
        const r = await resolveRefs(ctx, [i.metViaContactId]);
        to = r.refs.get(i.metViaContactId)!;
        dependsOn.push(...r.dependsOn);
      }
      if ((to?.id ?? null) !== (d.metVia?.id ?? null)) {
        body.metViaContactId = to?.id ?? null;
        changes.push({ label: "Met via", from: d.metVia?.displayName ?? null, to: to?.displayName ?? null });
      }
    }
    if (i.employerContactId !== undefined) {
      if (!isPerson) throw new AskToolError("Only people have an employer");
      let to: ContactRef | null = null;
      if (i.employerContactId) {
        await checkEmployer(ctx, d.id, i.employerContactId);
        const r = await resolveRefs(ctx, [i.employerContactId]);
        to = r.refs.get(i.employerContactId)!;
        dependsOn.push(...r.dependsOn);
      }
      if ((to?.id ?? null) !== (d.employer?.id ?? null)) {
        body.employerContactId = to?.id ?? null;
        changes.push({ label: "Employer", from: d.employer?.displayName ?? null, to: to?.displayName ?? null });
      }
    }
    if (i.customFields !== undefined) {
      const merged: Record<string, string | number | boolean | null> = { ...d.customFields };
      for (const [k, v] of Object.entries(i.customFields)) {
        if (v === null) delete merged[k];
        else merged[k] = v;
        if (show(d.customFields[k]) !== show(v)) changes.push({ label: k, from: show(d.customFields[k]), to: show(v) });
      }
      if (JSON.stringify(merged) !== JSON.stringify(d.customFields)) body.customFields = merged;
    }
    if (changes.length === 0) throw new AskToolError("Nothing would change: no fields were given, or the contact already has these values");
    return emitAction(ctx, {
      title: `Update ${d.displayName}`,
      contact: toRef(d),
      changes,
      request: { method: "PATCH", path: `/api/contacts/${d.id}`, body },
      dependsOn,
    });
  },
});

const proposeContactCreate = def({
  name: "propose_contact_create",
  description:
    "Draft a new contact (person, pet or organisation) with optional details, tags and contact methods. Shown to the user with an Apply button; nothing is saved by you. Search first so you do not duplicate an existing contact. employerContactId / metViaContactId must be existing contacts.",
  schema: z.object({
    kind: z.enum(CONTACT_KINDS),
    firstName: nonBlank(200).describe("Given name, pet name, or organisation name"),
    lastName: text(200),
    nickname: text(200),
    pronouns: text(40),
    animalType: text(100).describe("Pets only: species or breed, e.g. Dog, Cockapoo"),
    birthday: birthdaySchema.nullable().optional(),
    jobTitle: text(200),
    employerContactId: idSchema.nullable().optional(),
    metOn: birthdaySchema.nullable().optional(),
    metWhere: text(200),
    metHow: text(2000),
    metViaContactId: idSchema.nullable().optional(),
    notes: text(50_000),
    tagNames: z.array(nonBlank(50)).max(50).optional(),
    methods: z.array(z.object({ type: contactMethodTypeSchema, label: text(100), value: nonBlank(1000), isPrimary: z.boolean().optional() })).max(50).optional(),
  }),
  label: (i) => `Drafting a new contact “${i.firstName}”`,
  run: async (i, ctx) => {
    const parsed = contactCreateSchema.safeParse(i);
    if (!parsed.success) throw new AskToolError(parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
    const body = parsed.data;
    if (i.kind !== "person" && (body.jobTitle || body.employerContactId || body.pronouns)) throw new AskToolError("Only people have pronouns, a job title or an employer");
    if (i.kind !== "pet" && body.animalType) throw new AskToolError("Only pets have an animal type");
    const lookups = [body.employerContactId, body.metViaContactId].filter((x): x is string => !!x);
    const { refs, dependsOn } = await resolveRefs(ctx, lookups);
    if (body.employerContactId) await checkEmployer(ctx, "new", body.employerContactId);

    const changes: Change[] = [{ label: "Kind", from: null, to: i.kind }];
    const name = [body.firstName, body.lastName].filter(Boolean).join(" ");
    changes.push({ label: "Name", from: null, to: name });
    const fields: [string, unknown][] = [
      ["Nickname", body.nickname],
      ["Pronouns", body.pronouns],
      ["Animal type", body.animalType],
      ["Birthday", body.birthday],
      ["Job title", body.jobTitle],
      ["Employer", body.employerContactId ? refs.get(body.employerContactId)?.displayName : null],
      ["Met on", body.metOn],
      ["Met where", body.metWhere],
      ["How we met", body.metHow],
      ["Met via", body.metViaContactId ? refs.get(body.metViaContactId)?.displayName : null],
      ["Notes", body.notes],
      ["Tags", body.tagNames.length ? body.tagNames.join(", ") : null],
    ];
    for (const [label, v] of fields) if (show(v)) changes.push({ label, from: null, to: show(v) });
    for (const m of body.methods) changes.push({ label: m.label ? `${m.type} (${m.label})` : m.type, from: null, to: m.value });
    const id = newId();
    const placeholder = pendingIdFor(id);
    ctx.pending.set(placeholder, { proposalId: id, ref: { id: placeholder, kind: body.kind, displayName: name, avatarUrl: null } });
    emitAction(ctx, { id, title: `Create ${name}`, contact: null, changes, request: { method: "POST", path: "/api/contacts", body }, dependsOn });
    return `The proposal “Create ${name}” is shown to the user with an Apply button. Its contact id will be ${placeholder} once applied: use exactly that id in any further proposals in this reply that need it (employerContactId, metViaContactId, relationship ids, interaction contactIds, tags, life events). Then summarise in one sentence; do not say anything was saved.`;
  },
});

const proposeArchive = def({
  name: "propose_archive",
  description: "Draft archiving (or un-archiving) a contact. Archived contacts are hidden from lists but keep their history. Shown to the user with an Apply button.",
  schema: z.object({ contactId: idSchema, archived: z.boolean() }),
  label: (i) => (i.archived ? "Drafting an archive for you to review" : "Drafting an un-archive for you to review"),
  run: async (i, ctx) => {
    const d = await getContactDetail(ctx.db, i.contactId);
    if (!!d.archivedAt === i.archived) throw new AskToolError(`${d.displayName} is already ${i.archived ? "archived" : "active"}`);
    return emitAction(ctx, {
      title: `${i.archived ? "Archive" : "Un-archive"} ${d.displayName}`,
      contact: toRef(d),
      changes: [{ label: "Status", from: d.archivedAt ? "archived" : "active", to: i.archived ? "archived" : "active" }],
      request: { method: "POST", path: `/api/contacts/${d.id}/${i.archived ? "archive" : "unarchive"}` },
      destructive: i.archived,
    });
  },
});

// ---------------------------------------------------------------------------
// Tags and contact methods

const proposeTags = def({
  name: "propose_tags",
  description: "Draft adding and/or removing tags on a contact. Tags that do not exist yet are created on apply. Shown to the user with an Apply button.",
  schema: z.object({ contactId: idSchema, add: z.array(nonBlank(50)).max(50).optional(), remove: z.array(nonBlank(50)).max(50).optional() }),
  label: () => "Drafting a tag change for you to review",
  run: async (i, ctx) => {
    const { detail: d, ref, dependsOn } = await contactOrPending(ctx, i.contactId);
    if (!d) throw new AskToolError("That contact does not exist yet: put its tags in the propose_contact_create call instead");
    const current = d.tags.map((t) => t.name);
    const removeSet = new Set((i.remove ?? []).map((t) => t.toLowerCase()));
    const next = current.filter((t) => !removeSet.has(t.toLowerCase()));
    for (const t of i.add ?? []) if (!next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t);
    if (JSON.stringify(next) === JSON.stringify(current)) throw new AskToolError("Nothing would change: those tags are already set (or already absent)");
    return emitAction(ctx, {
      title: `Update tags on ${ref.displayName}`,
      contact: ref,
      changes: [{ label: "Tags", from: current.join(", ") || null, to: next.join(", ") || null }],
      request: { method: "PUT", path: `/api/contacts/${ref.id}/tags`, body: { tagNames: next } },
      dependsOn,
    });
  },
});

const proposeContactMethod = def({
  name: "propose_contact_method",
  description:
    "Draft adding, updating or removing a phone, email, address, social profile or URL on a contact. For update/remove pass the methodId from get_contact. Shown to the user with an Apply button.",
  schema: z.object({
    contactId: idSchema,
    action: z.enum(["add", "update", "remove"]),
    methodId: idSchema.optional(),
    type: contactMethodTypeSchema.optional(),
    label: text(100).describe("e.g. mobile, work, home; for social the platform key (linkedin, instagram…)"),
    value: z.string().trim().max(1000).optional(),
    isPrimary: z.boolean().optional(),
  }),
  label: (i) => `Drafting a contact-method ${i.action} for you to review`,
  run: async (i, ctx) => {
    const { detail: d, ref: contact, dependsOn } = await contactOrPending(ctx, i.contactId);
    if (i.action === "add") {
      const parsed = contactMethodInputSchema.safeParse({ type: i.type, label: i.label ?? null, value: i.value, isPrimary: i.isPrimary ?? false });
      if (!parsed.success) throw new AskToolError(parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
      const body = parsed.data;
      if (d?.methods.some((m) => m.type === body.type && m.value.trim().toLowerCase() === body.value.trim().toLowerCase())) throw new AskToolError("That contact method already exists");
      return emitAction(ctx, {
        title: `Add ${body.type} to ${contact.displayName}`,
        contact,
        changes: [{ label: body.label ? `${body.type} (${body.label})` : body.type, from: null, to: body.value }],
        request: { method: "POST", path: `/api/contacts/${contact.id}/methods`, body },
        dependsOn,
      });
    }
    if (!d) throw new AskToolError("That contact does not exist yet; only add is possible until the create is applied");
    const existing = i.methodId ? d.methods.find((m) => m.id === i.methodId) : undefined;
    if (!existing) throw new AskToolError("methodId is required and must belong to this contact (see get_contact)");
    const name = existing.label ? `${existing.type} (${existing.label})` : existing.type;
    if (i.action === "remove") {
      return emitAction(ctx, {
        title: `Remove ${name} from ${d.displayName}`,
        contact,
        changes: [{ label: name, from: existing.value, to: null }],
        request: { method: "DELETE", path: `/api/contacts/${d.id}/methods/${existing.id}` },
        destructive: true,
      });
    }
    const body: Record<string, unknown> = {};
    const changes: Change[] = [];
    if (i.type !== undefined && i.type !== existing.type) (body.type = i.type), changes.push({ label: "Type", from: existing.type, to: i.type });
    if (i.label !== undefined && norm(i.label) !== existing.label) (body.label = norm(i.label)), changes.push({ label: "Label", from: existing.label, to: norm(i.label) ?? null });
    if (i.value !== undefined && i.value.trim() && i.value.trim() !== existing.value) (body.value = i.value.trim()), changes.push({ label: "Value", from: existing.value, to: i.value.trim() });
    if (i.isPrimary !== undefined && i.isPrimary !== existing.isPrimary) (body.isPrimary = i.isPrimary), changes.push({ label: "Primary", from: String(existing.isPrimary), to: String(i.isPrimary) });
    if (changes.length === 0) throw new AskToolError("Nothing would change");
    return emitAction(ctx, { title: `Update ${name} on ${d.displayName}`, contact, changes, request: { method: "PATCH", path: `/api/contacts/${d.id}/methods/${existing.id}`, body } });
  },
});

// ---------------------------------------------------------------------------
// Relationships

function parseKinds(csv: string): string[] {
  return csv.split(",").map((k) => k.trim());
}

const proposeRelationship = def({
  name: "propose_relationship",
  description:
    "Draft adding, updating or removing a relationship between two contacts. A relationship reads \"from is the <type> of to\" (e.g. from=Acme Ltd, type=employer, to=Sam; from=Alice, type=owner, to=Rex). Type keys come from the relationship types list (e.g. parent, child, sibling, partner, friend, employer, owner, vet); an unknown key returns the available ones. For update/remove pass the relationship id from get_contact. Shown to the user with an Apply button.",
  schema: z.object({
    action: z.enum(["add", "update", "remove"]),
    relationshipId: idSchema.optional(),
    fromContactId: idSchema.optional(),
    toContactId: idSchema.optional(),
    typeKey: z.string().trim().max(50).optional(),
    label: text(200).describe("Free-text qualifier, e.g. \"step\", \"former\""),
    notes: text(5000),
    startedAt: isoDateSchema.nullable().optional(),
    endedAt: isoDateSchema.nullable().optional(),
  }),
  label: (i) => `Drafting a relationship ${i.action} for you to review`,
  run: async (i, ctx) => {
    const { relationships, relationshipTypes } = schema;
    const types = await ctx.db.select().from(relationshipTypes);
    const findType = (key: string) => {
      const t = types.find((x) => x.key === key);
      if (!t) throw new AskToolError(`Unknown relationship type “${key}”. Available: ${types.map((x) => x.key).join(", ")}`);
      return t;
    };
    if (i.action === "add") {
      if (!i.fromContactId || !i.toContactId || !i.typeKey) throw new AskToolError("add needs fromContactId, toContactId and typeKey");
      if (i.fromContactId === i.toContactId) throw new AskToolError("A contact cannot be related to itself");
      const type = findType(i.typeKey);
      const { refs, dependsOn } = await resolveRefs(ctx, [i.fromContactId, i.toContactId]);
      const from = refs.get(i.fromContactId)!;
      const to = refs.get(i.toContactId)!;
      if (!parseKinds(type.fromKinds).includes(from.kind)) throw new AskToolError(`A ${from.kind} cannot be the ${type.label.toLowerCase()} of anyone (allowed: ${type.fromKinds})`);
      if (!parseKinds(type.toKinds).includes(to.kind)) throw new AskToolError(`A ${to.kind} cannot have a ${type.label.toLowerCase()} (allowed: ${type.toKinds})`);
      const body = { fromContactId: from.id, toContactId: to.id, typeKey: type.key, label: norm(i.label) ?? null, notes: norm(i.notes) ?? null, startedAt: i.startedAt ?? null, endedAt: i.endedAt ?? null };
      const changes: Change[] = [{ label: "Relationship", from: null, to: `${from.displayName} is the ${type.label.toLowerCase()} of ${to.displayName}` }];
      if (body.label) changes.push({ label: "Label", from: null, to: body.label });
      if (body.startedAt) changes.push({ label: "Started", from: null, to: body.startedAt });
      if (body.endedAt) changes.push({ label: "Ended", from: null, to: body.endedAt });
      if (body.notes) changes.push({ label: "Notes", from: null, to: body.notes });
      return emitAction(ctx, { title: `Add relationship: ${from.displayName} → ${to.displayName}`, contact: to, changes, request: { method: "POST", path: "/api/relationships", body }, dependsOn });
    }
    if (!i.relationshipId) throw new AskToolError("relationshipId is required (see get_contact)");
    const row = await ctx.db.select().from(relationships).where(eq(relationships.id, i.relationshipId)).get();
    if (!row) throw new AskToolError("Not found");
    const { refs } = await resolveRefs(ctx, [row.fromContactId, row.toContactId]);
    const from = refs.get(row.fromContactId)!;
    const to = refs.get(row.toContactId)!;
    const type = types.find((x) => x.key === row.typeKey);
    const describe = `${from.displayName} is the ${(type?.label ?? row.typeKey).toLowerCase()} of ${to.displayName}`;
    if (i.action === "remove") {
      return emitAction(ctx, {
        title: `Remove relationship: ${describe}`,
        contact: to,
        changes: [{ label: "Relationship", from: describe, to: null }],
        request: { method: "DELETE", path: `/api/relationships/${row.id}` },
        destructive: true,
      });
    }
    const body: Record<string, unknown> = {};
    const changes: Change[] = [];
    if (i.typeKey !== undefined && i.typeKey !== row.typeKey) {
      const t = findType(i.typeKey);
      body.typeKey = t.key;
      changes.push({ label: "Type", from: type?.label ?? row.typeKey, to: t.label });
    }
    for (const f of ["label", "notes", "startedAt", "endedAt"] as const) {
      const next = f === "startedAt" || f === "endedAt" ? i[f] : norm(i[f]);
      if (next === undefined || next === row[f]) continue;
      body[f] = next;
      changes.push({ label: f === "startedAt" ? "Started" : f === "endedAt" ? "Ended" : f[0]!.toUpperCase() + f.slice(1), from: row[f], to: next });
    }
    if (changes.length === 0) throw new AskToolError("Nothing would change");
    return emitAction(ctx, { title: `Update relationship: ${describe}`, contact: to, changes, request: { method: "PATCH", path: `/api/relationships/${row.id}`, body } });
  },
});

// ---------------------------------------------------------------------------
// Life events

const proposeLifeEvent = def({
  name: "propose_life_event",
  description:
    "Draft adding, updating or removing a life event (new job, move, wedding, trip, health…) on a contact. Categories: work_education, family_relationships, home_living, health_wellness, travel_experiences. occurredOn is a partial date. For update/remove pass the lifeEventId from list_life_events. Shown to the user with an Apply button.",
  schema: z.object({
    contactId: idSchema,
    action: z.enum(["add", "update", "remove"]),
    lifeEventId: idSchema.optional(),
    category: z.enum(LIFE_EVENT_CATEGORIES).optional(),
    title: z.string().trim().max(200).optional(),
    occurredOn: birthdaySchema.optional(),
    body: text(20_000),
  }),
  label: (i) => `Drafting a life-event ${i.action} for you to review`,
  run: async (i, ctx) => {
    const { detail: d, ref: contact, dependsOn } = await contactOrPending(ctx, i.contactId);
    if (i.action === "add") {
      const parsed = lifeEventCreateSchema.safeParse({ category: i.category, title: i.title, occurredOn: i.occurredOn, body: i.body ?? null });
      if (!parsed.success) throw new AskToolError(parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
      const body = parsed.data;
      const changes: Change[] = [
        { label: "Category", from: null, to: LIFE_EVENT_CATEGORY_LABELS[body.category] },
        { label: "Title", from: null, to: body.title },
        { label: "When", from: null, to: body.occurredOn },
      ];
      if (body.body) changes.push({ label: "Details", from: null, to: body.body });
      return emitAction(ctx, { title: `Add life event for ${contact.displayName}`, contact, changes, request: { method: "POST", path: `/api/contacts/${contact.id}/life-events`, body }, dependsOn });
    }
    if (!d) throw new AskToolError("That contact does not exist yet; only add is possible until the create is applied");
    if (!i.lifeEventId) throw new AskToolError("lifeEventId is required (see list_life_events)");
    const row = await ctx.db.select().from(schema.lifeEvents).where(eq(schema.lifeEvents.id, i.lifeEventId)).get();
    if (!row || row.contactId !== d.id) throw new AskToolError("Not found");
    if (i.action === "remove") {
      return emitAction(ctx, {
        title: `Remove life event “${row.title}”`,
        contact,
        changes: [{ label: "Life event", from: `${row.title} (${row.occurredOn})`, to: null }],
        request: { method: "DELETE", path: `/api/life-events/${row.id}` },
        destructive: true,
      });
    }
    const body: Record<string, unknown> = {};
    const changes: Change[] = [];
    if (i.category !== undefined && i.category !== row.category) (body.category = i.category), changes.push({ label: "Category", from: LIFE_EVENT_CATEGORY_LABELS[row.category], to: LIFE_EVENT_CATEGORY_LABELS[i.category] });
    if (i.title !== undefined && i.title.trim() && i.title.trim() !== row.title) (body.title = i.title.trim()), changes.push({ label: "Title", from: row.title, to: i.title.trim() });
    if (i.occurredOn !== undefined && i.occurredOn !== row.occurredOn) (body.occurredOn = i.occurredOn), changes.push({ label: "When", from: row.occurredOn, to: i.occurredOn });
    if (i.body !== undefined && norm(i.body) !== row.body) (body.body = norm(i.body) ?? null), changes.push({ label: "Details", from: row.body, to: norm(i.body) ?? null });
    if (changes.length === 0) throw new AskToolError("Nothing would change");
    return emitAction(ctx, { title: `Update life event “${row.title}”`, contact, changes, request: { method: "PATCH", path: `/api/life-events/${row.id}`, body } });
  },
});

// ---------------------------------------------------------------------------
// Bets

const proposeBet = def({
  name: "propose_bet",
  description:
    "Draft a bet with a contact: add one (the user's prediction, an optional wager, and a reviewOn date when the result will be known), update its fields, settle it (outcome: me = the prediction held, them = it did not, void = called off; note = how it fell), reopen a settled one, or remove it. For anything but add pass the betId from list_bets. Dates are YYYY-MM-DD; madeOn defaults to today. Shown to the user with an Apply button.",
  schema: z.object({
    contactId: idSchema,
    action: z.enum(["add", "update", "settle", "reopen", "remove"]),
    betId: idSchema.optional(),
    prediction: z.string().trim().max(500).optional(),
    wager: text(200),
    madeOn: isoDateSchema.optional(),
    reviewOn: isoDateSchema.optional(),
    details: text(20_000),
    outcome: betOutcomeSchema.optional().describe("settle only"),
    note: text(5000).describe("settle only: how it actually fell"),
  }),
  label: (i) => `Drafting a bet ${i.action} for you to review`,
  run: async (i, ctx) => {
    const { detail: d, ref: contact, dependsOn } = await contactOrPending(ctx, i.contactId);
    if (i.action === "add") {
      const parsed = betCreateSchema.safeParse({ prediction: i.prediction, wager: i.wager ?? null, madeOn: i.madeOn, reviewOn: i.reviewOn, details: i.details ?? null });
      if (!parsed.success) throw new AskToolError(parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
      const body = parsed.data;
      const changes: Change[] = [
        { label: "Prediction", from: null, to: body.prediction },
        { label: "Review on", from: null, to: body.reviewOn },
      ];
      if (body.wager) changes.push({ label: "Wager", from: null, to: body.wager });
      if (body.madeOn) changes.push({ label: "Made on", from: null, to: body.madeOn });
      if (body.details) changes.push({ label: "Details", from: null, to: body.details });
      return emitAction(ctx, { title: `Add bet with ${contact.displayName}`, contact, changes, request: { method: "POST", path: `/api/contacts/${contact.id}/bets`, body }, dependsOn });
    }
    if (!d) throw new AskToolError("That contact does not exist yet; only add is possible until the create is applied");
    if (!i.betId) throw new AskToolError("betId is required (see list_bets)");
    const row = await ctx.db.select().from(schema.bets).where(eq(schema.bets.id, i.betId)).get();
    if (!row || row.contactId !== d.id) throw new AskToolError("Not found");
    const quoted = `“${row.prediction}”`;
    if (i.action === "remove") {
      return emitAction(ctx, {
        title: `Remove bet ${quoted}`,
        contact,
        changes: [{ label: "Bet", from: `${row.prediction} (review ${row.reviewOn})`, to: null }],
        request: { method: "DELETE", path: `/api/bets/${row.id}` },
        destructive: true,
      });
    }
    if (i.action === "settle") {
      if (!i.outcome) throw new AskToolError("outcome is required to settle (me, them or void)");
      const note = norm(i.note) ?? null;
      const changes: Change[] = [{ label: "Outcome", from: row.outcome ? BET_OUTCOME_LABELS[row.outcome] : "open", to: BET_OUTCOME_LABELS[i.outcome] }];
      if (note) changes.push({ label: "How it fell", from: row.settledNote, to: note });
      return emitAction(ctx, { title: `Settle bet ${quoted}`, contact, changes, request: { method: "POST", path: `/api/bets/${row.id}/settle`, body: { outcome: i.outcome, note } } });
    }
    if (i.action === "reopen") {
      if (!row.outcome) throw new AskToolError("That bet is still open");
      return emitAction(ctx, {
        title: `Reopen bet ${quoted}`,
        contact,
        changes: [{ label: "Outcome", from: BET_OUTCOME_LABELS[row.outcome], to: "open" }],
        request: { method: "POST", path: `/api/bets/${row.id}/reopen` },
      });
    }
    const body: Record<string, unknown> = {};
    const changes: Change[] = [];
    if (i.prediction !== undefined && i.prediction.trim() && i.prediction.trim() !== row.prediction) (body.prediction = i.prediction.trim()), changes.push({ label: "Prediction", from: row.prediction, to: i.prediction.trim() });
    if (i.wager !== undefined && norm(i.wager) !== row.wager) (body.wager = norm(i.wager) ?? null), changes.push({ label: "Wager", from: row.wager, to: norm(i.wager) ?? null });
    if (i.madeOn !== undefined && i.madeOn !== row.madeOn) (body.madeOn = i.madeOn), changes.push({ label: "Made on", from: row.madeOn, to: i.madeOn });
    if (i.reviewOn !== undefined && i.reviewOn !== row.reviewOn) (body.reviewOn = i.reviewOn), changes.push({ label: "Review on", from: row.reviewOn, to: i.reviewOn });
    if (i.details !== undefined && norm(i.details) !== row.details) (body.details = norm(i.details) ?? null), changes.push({ label: "Details", from: row.details, to: norm(i.details) ?? null });
    if (changes.length === 0) throw new AskToolError("Nothing would change");
    return emitAction(ctx, { title: `Update bet ${quoted}`, contact, changes, request: { method: "PATCH", path: `/api/bets/${row.id}`, body } });
  },
});

// ---------------------------------------------------------------------------
// Interactions (existing ones; new ones go through propose_interaction)

const proposeInteractionUpdate = def({
  name: "propose_interaction_update",
  description:
    "Draft changes to an existing interaction: type, time, summary, body, location or participants. Read it with get_interaction first. Pass only the fields that change; contactIds replaces the whole participant list. Shown to the user with an Apply button.",
  schema: z.object({
    interactionId: idSchema,
    type: z.enum(INTERACTION_TYPES).optional(),
    occurredAt: isoDateTimeSchema.optional(),
    summary: z.string().trim().max(500).optional(),
    body: text(50_000),
    location: text(500),
    contactIds: z.array(idSchema).min(1).max(ID_LIST_MAX).optional(),
  }),
  label: () => "Drafting an interaction edit for you to review",
  run: async (i, ctx) => {
    const x = await getInteractionOut(ctx.db, i.interactionId);
    const body: Record<string, unknown> = {};
    const changes: Change[] = [];
    const participantDeps: string[] = [];
    if (i.type !== undefined && i.type !== x.type) (body.type = i.type), changes.push({ label: "Type", from: x.type, to: i.type });
    if (i.occurredAt !== undefined && Date.parse(i.occurredAt) !== Date.parse(x.occurredAt)) (body.occurredAt = i.occurredAt), changes.push({ label: "When", from: x.occurredAt, to: i.occurredAt });
    if (i.summary !== undefined && i.summary.trim() && i.summary.trim() !== x.summary) (body.summary = i.summary.trim()), changes.push({ label: "Summary", from: x.summary, to: i.summary.trim() });
    if (i.body !== undefined && norm(i.body) !== x.body) (body.body = norm(i.body) ?? null), changes.push({ label: "Body", from: x.body, to: norm(i.body) ?? null });
    if (i.location !== undefined && norm(i.location) !== x.location) (body.location = norm(i.location) ?? null), changes.push({ label: "Location", from: x.location, to: norm(i.location) ?? null });
    if (i.contactIds !== undefined) {
      const ids = [...new Set(i.contactIds)];
      const { refs, dependsOn: deps } = await resolveRefs(ctx, ids);
      participantDeps.push(...deps);
      const current = x.participants.map((p) => p.id);
      if (JSON.stringify([...ids].sort()) !== JSON.stringify([...current].sort())) {
        body.contactIds = ids;
        changes.push({ label: "Participants", from: x.participants.map((p) => p.displayName).join(", "), to: ids.map((id) => refs.get(id)!.displayName).join(", ") });
      }
    }
    if (changes.length === 0) throw new AskToolError("Nothing would change");
    return emitAction(ctx, {
      title: `Update interaction “${x.summary}”`,
      contact: x.participants[0] ?? null,
      changes,
      request: { method: "PATCH", path: `/api/interactions/${x.id}`, body },
      dependsOn: participantDeps,
    });
  },
});

const proposeInteractionDelete = def({
  name: "propose_interaction_delete",
  description: "Draft deleting an interaction (and its attachments). Only when the user clearly asks to delete it. Shown to the user with an Apply button.",
  schema: z.object({ interactionId: idSchema }),
  label: () => "Drafting an interaction deletion for you to review",
  run: async (i, ctx) => {
    const x = await getInteractionOut(ctx.db, i.interactionId);
    return emitAction(ctx, {
      title: `Delete interaction “${x.summary}”`,
      contact: x.participants[0] ?? null,
      changes: [{ label: "Interaction", from: `${x.summary} (${x.occurredAt.slice(0, 10)}, ${x.participants.map((p) => p.displayName).join(", ")})`, to: null }],
      request: { method: "DELETE", path: `/api/interactions/${x.id}` },
      destructive: true,
    });
  },
});

/** Fixed order; appended to the read tools in tools.ts. */
export const PROPOSAL_TOOLS = [
  proposeContactUpdate,
  proposeContactCreate,
  proposeTags,
  proposeContactMethod,
  proposeRelationship,
  proposeLifeEvent,
  proposeBet,
  proposeInteractionUpdate,
  proposeInteractionDelete,
  proposeArchive,
];
