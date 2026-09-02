import { and, eq } from "drizzle-orm";
import { schema, type Db } from "../db";
import type { Stmt } from "../lib/batch";
import { ApiError } from "../lib/errors";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { activityInserts, event } from "./activity";
import { contactRefs } from "./contacts";

const { contacts, relationships } = schema;

/** "employer is the employer of person" is the stored direction. */
const EMPLOYER = { key: "employer", label: "Employer", inverseKey: "employee", inverseLabel: "Employee" } as const;

/** The employer must exist and be an organisation. */
export async function assertEmployer(db: Db, personId: string, employerId: string | null | undefined) {
  if (!employerId) return;
  if (employerId === personId) throw ApiError.badRequest("A contact cannot employ themselves");
  const row = await db.select({ kind: contacts.kind }).from(contacts).where(eq(contacts.id, employerId)).get();
  if (!row) throw ApiError.badRequest("employerContactId does not exist");
  if (row.kind !== "organization") throw ApiError.badRequest("Place of work must be an organisation contact");
}

/**
 * Statements that keep the employer ↔ employee relationship in step with the
 * contact's employer field: drop the old link (if it was created for the old
 * employer) and add the new one unless it already exists. Include them in the
 * same batch as the contact update.
 */
export async function employerSyncStatements(db: Db, personId: string, before: string | null, after: string | null, actor: string): Promise<Stmt[]> {
  if (before === after) return [];
  const stmts: Stmt[] = [];
  const refs = await contactRefs(db, [personId, before, after].filter((x): x is string => !!x));
  const person = refs.get(personId);
  if (!person) return [];

  if (before) {
    const old = await db
      .select({ id: relationships.id })
      .from(relationships)
      .where(and(eq(relationships.fromContactId, before), eq(relationships.toContactId, personId), eq(relationships.typeKey, EMPLOYER.key)))
      .get();
    const org = refs.get(before);
    if (old && org) {
      stmts.push(
        db.delete(relationships).where(eq(relationships.id, old.id)),
        ...activityInserts(
          db,
          [
            event(personId, "relationship", old.id, "relationship.removed", { v: 1, otherContactId: org.id, otherDisplayName: org.displayName, typeKey: EMPLOYER.key, typeLabel: EMPLOYER.label }),
            event(org.id, "relationship", old.id, "relationship.removed", { v: 1, otherContactId: personId, otherDisplayName: person.displayName, typeKey: EMPLOYER.inverseKey, typeLabel: EMPLOYER.inverseLabel }),
          ],
          actor,
        ),
      );
    }
  }

  if (after) {
    const org = refs.get(after);
    const existing = await db
      .select({ id: relationships.id })
      .from(relationships)
      .where(and(eq(relationships.fromContactId, after), eq(relationships.toContactId, personId), eq(relationships.typeKey, EMPLOYER.key)))
      .get();
    if (org && !existing) {
      const now = nowIso();
      const id = newId();
      stmts.push(
        db.insert(relationships).values({
          id,
          fromContactId: after,
          toContactId: personId,
          typeKey: EMPLOYER.key,
          label: null,
          notes: null,
          startedAt: null,
          endedAt: null,
          createdAt: now,
          updatedAt: now,
        }),
        ...activityInserts(
          db,
          [
            event(personId, "relationship", id, "relationship.added", { v: 1, otherContactId: org.id, otherDisplayName: org.displayName, typeKey: EMPLOYER.key, typeLabel: EMPLOYER.label, direction: "incoming", label: null }),
            event(org.id, "relationship", id, "relationship.added", { v: 1, otherContactId: personId, otherDisplayName: person.displayName, typeKey: EMPLOYER.inverseKey, typeLabel: EMPLOYER.inverseLabel, direction: "outgoing", label: null }),
          ],
          actor,
        ),
      );
    }
  }
  return stmts;
}

/** When an employer relationship is deleted by hand, clear the matching employer field so the two stay consistent. */
export function clearEmployerFieldStatement(db: Db, rel: { fromContactId: string; toContactId: string; typeKey: string }): Stmt | null {
  if (rel.typeKey === "employer") {
    return db.update(contacts).set({ employerContactId: null }).where(and(eq(contacts.id, rel.toContactId), eq(contacts.employerContactId, rel.fromContactId)));
  }
  if (rel.typeKey === "employee") {
    return db.update(contacts).set({ employerContactId: null }).where(and(eq(contacts.id, rel.fromContactId), eq(contacts.employerContactId, rel.toContactId)));
  }
  return null;
}
