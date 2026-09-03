/**
 * Response shapes returned by the API. Inputs are validated with the zod
 * schemas in ./schemas; outputs are plain TypeScript types so the Worker can
 * build them cheaply and the SPA can consume them without re-parsing.
 */
import type { ActivityEventType } from "./schemas/activity";
import type { UserPreferences } from "./schemas/preferences";
import type { LifeEventCategory } from "./schemas/life-event";
import type { BetOutcome } from "./schemas/bet";
import type { ContactKind, ContactMethodType, EntityType, FileKind, InteractionType, RelationshipCategory } from "./schemas/common";

export interface ListResult<T> {
  items: T[];
  total: number;
}

export interface ApiErrorBody {
  error: {
    code: "validation_error" | "not_found" | "conflict" | "payload_too_large" | "bad_request" | "unauthorized" | "forbidden" | "internal";
    message: string;
    issues?: unknown[];
  };
}

/** The signed-in user, from the verified OIDC id_token. Identity is keyed on `sub`. */
export interface AuthUser {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  roles: string[];
  /** roles.includes("admin") */
  isAdmin: boolean;
  /** "open": no sign-in, single implicit owner; "oidc": OpenID Connect sessions. */
  authMode: "open" | "oidc";
  /** Display name of the identity provider (sign-in button, account page). */
  providerLabel: string;
  preferences: UserPreferences;
}

export interface TagOut {
  id: string;
  name: string;
  color: string | null;
}

export interface TagWithCount extends TagOut {
  contactCount: number;
}

export interface ContactMethodOut {
  id: string;
  contactId: string;
  type: ContactMethodType;
  label: string | null;
  value: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LastInteraction {
  id: string;
  type: InteractionType;
  occurredAt: string;
  summary: string;
}

export interface ContactRef {
  id: string;
  kind: ContactKind;
  displayName: string;
  avatarUrl: string | null;
}

export interface ContactSummary extends ContactRef {
  firstName: string;
  lastName: string | null;
  nickname: string | null;
  pronouns: string | null;
  /** Other names this contact goes by (Chinese name, English name, maiden name, …). */
  otherNames: { label: string; value: string }[];
  jobTitle: string | null;
  /** Place of work (an organisation contact); kept in step with the employer relationship. */
  employer: ContactRef | null;
  /** `YYYY-MM-DD`, or `--MM-DD` when the year is unknown. */
  birthday: string | null;
  /** The uncropped photo the avatar was made from, if one was kept. */
  avatarFullUrl: string | null;
  tags: TagOut[];
  primaryEmail: string | null;
  primaryPhone: string | null;
  lastInteraction: LastInteraction | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactDetail extends ContactSummary {
  metOn: string | null;
  metWhere: string | null;
  metHow: string | null;
  /** Resolved "introduced by / known through" contact. */
  metVia: ContactRef | null;
  notes: string | null;
  customFields: Record<string, string | number | boolean | null>;
  methods: ContactMethodOut[];
  relationshipCount: number;
  avatarFileId: string | null;
  avatarOriginalFileId: string | null;
}

export interface RelationshipTypeOut {
  key: string;
  label: string;
  inverseKey: string;
  category: RelationshipCategory;
  sortOrder: number;
  /** Kinds that can be the `from` side ("from is the <type> of to"). */
  fromKinds: ContactKind[];
  /** Kinds that can be the `to` side. */
  toKinds: ContactKind[];
}

/**
 * A relationship normalised to the perspective of the contact being viewed.
 * A stored row means "from is the <type> of to"; here `typeKey`/`typeLabel`
 * describe the OTHER contact's role relative to the viewed contact, e.g. on
 * Alice's page a row for Rex reads "Pet", and on Rex's page Alice reads "Owner".
 */
export interface RelationshipOut {
  id: string;
  /** The contact on the other end. */
  otherContact: ContactRef;
  /** The other contact's role relative to the viewed contact. */
  typeKey: string;
  typeLabel: string;
  category: RelationshipCategory;
  /** "outgoing" = stored row has the viewing contact as `from`. */
  direction: "outgoing" | "incoming";
  label: string | null;
  notes: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Raw stored relationship row (as created). */
export interface RelationshipRowOut {
  id: string;
  fromContactId: string;
  toContactId: string;
  typeKey: string;
  label: string | null;
  notes: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileOut {
  id: string;
  kind: FileKind;
  contactId: string | null;
  interactionId: string | null;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  createdAt: string;
}

export interface InteractionOut {
  id: string;
  type: InteractionType;
  occurredAt: string;
  summary: string;
  body: string | null;
  location: string | null;
  participants: ContactRef[];
  attachments: FileOut[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEventOut {
  id: string;
  contactId: string;
  entityType: EntityType;
  entityId: string;
  eventType: ActivityEventType | string;
  actor: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface LifeEventOut {
  id: string;
  contactId: string;
  category: LifeEventCategory;
  title: string;
  /** Partial date: YYYY-MM-DD, YYYY-MM, YYYY, --MM-DD or --MM. */
  occurredOn: string;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BetOut {
  id: string;
  /** The other party. */
  contact: ContactRef;
  prediction: string;
  wager: string | null;
  /** YYYY-MM-DD */
  madeOn: string;
  /** YYYY-MM-DD */
  reviewOn: string;
  details: string | null;
  status: "open" | "settled";
  /** null while open. */
  outcome: BetOutcome | null;
  settledAt: string | null;
  settledNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Open / won / lost / void counts for a set of bets. */
export interface BetRecord {
  open: number;
  won: number;
  lost: number;
  void: number;
}

export interface BetListResult extends ListResult<BetOut> {
  /** Counts over every bet matching the filters except `status` (so the page can show the full record). */
  record: BetRecord;
}

export type FeedItem =
  | { kind: "interaction"; at: string; interaction: InteractionOut }
  | { kind: "lifeEvent"; at: string; lifeEvent: LifeEventOut }
  | { kind: "event"; at: string; event: ActivityEventOut };

export interface FeedResult {
  items: FeedItem[];
  /** Pass as `before` to fetch the next (older) page; null when exhausted. */
  nextBefore: string | null;
}

export interface SearchHit extends ContactRef {
  matchedOn: "name" | "nickname" | "method" | "tag";
  matchText: string;
}

export interface SearchResult {
  contacts: SearchHit[];
}
