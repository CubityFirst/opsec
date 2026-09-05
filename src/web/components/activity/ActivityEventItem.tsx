import { ArchiveIcon, AtSignIcon, BellIcon, BellOffIcon, CheckIcon, DicesIcon, FileIcon, HeartCrackIcon, LinkIcon, MilestoneIcon, PencilIcon, PlusIcon, RotateCcwIcon, SparklesIcon, TagIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { BET_OUTCOME_LABELS, type BetOutcome } from "@shared/schemas/bet";
import type { ActivityEventOut } from "@shared/types";
import { formatDateTime, formatRelative } from "@/lib/format";

type Payload = Record<string, unknown>;
const str = (p: Payload, k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");

function changeSummary(changes: unknown): string {
  if (!changes || typeof changes !== "object") return "";
  const keys = Object.keys(changes as Record<string, unknown>);
  if (keys.length === 0) return "";
  const shown = keys.slice(0, 3).join(", ");
  return keys.length > 3 ? `${shown} +${keys.length - 3} more` : shown;
}

export function describeEvent(e: ActivityEventOut): { icon: LucideIcon; text: React.ReactNode } {
  const p = e.payload;
  const other = str(p, "otherContactId") ? (
    <Link to={`/contacts/${str(p, "otherContactId")}`} className="font-medium hover:underline">
      {str(p, "otherDisplayName") || "a contact"}
    </Link>
  ) : null;

  switch (e.eventType) {
    case "contact.created":
      return { icon: SparklesIcon, text: <>Added to opsec▮</> };
    case "contact.updated":
      return { icon: PencilIcon, text: <>Updated {changeSummary(p.changes) || "details"}</> };
    case "contact.archived":
      return { icon: ArchiveIcon, text: <>Archived</> };
    case "contact.unarchived":
      return { icon: ArchiveIcon, text: <>Restored from archive</> };
    case "contact.deceased":
      return { icon: HeartCrackIcon, text: <>Marked as deceased{str(p, "on") ? ` (${str(p, "on")})` : ""}</> };
    case "contact.undeceased":
      return { icon: HeartCrackIcon, text: <>Deceased mark removed</> };
    case "contact_method.added":
      return { icon: PlusIcon, text: <>Added {str(p, "type")}{str(p, "label") ? ` (${str(p, "label")})` : ""}: {str(p, "value")}</> };
    case "contact_method.updated":
      return { icon: PencilIcon, text: <>Updated {str(p, "type")} {changeSummary(p.changes)}</> };
    case "contact_method.removed":
      return { icon: Trash2Icon, text: <>Removed {str(p, "type")}: {str(p, "value")}</> };
    case "tag.added":
      return { icon: TagIcon, text: <>Tagged “{str(p, "name")}”</> };
    case "tag.removed":
      return { icon: TagIcon, text: <>Untagged “{str(p, "name")}”</> };
    case "relationship.added":
      return { icon: LinkIcon, text: <>Added {other} as {str(p, "typeLabel").toLowerCase()}{str(p, "label") ? ` (${str(p, "label")})` : ""}</> };
    case "relationship.updated":
      return { icon: LinkIcon, text: <>Relationship with {other} updated ({changeSummary(p.changes)})</> };
    case "relationship.removed":
      return { icon: LinkIcon, text: <>Removed {other} as {str(p, "typeLabel").toLowerCase()}</> };
    case "life_event.created":
      return { icon: MilestoneIcon, text: <>Added life event “{str(p, "title")}”</> };
    case "life_event.updated":
      return { icon: PencilIcon, text: <>Edited life event “{str(p, "title")}” ({changeSummary(p.changes)})</> };
    case "life_event.deleted":
      return { icon: Trash2Icon, text: <>Removed life event “{str(p, "title")}”</> };
    case "bet.created":
      return { icon: DicesIcon, text: <>Made a bet: “{str(p, "prediction")}”{str(p, "wager") ? ` for ${str(p, "wager")}` : ""}, review on {str(p, "reviewOn")}</> };
    case "bet.updated":
      return { icon: PencilIcon, text: <>Edited bet “{str(p, "prediction")}” ({changeSummary(p.changes)})</> };
    case "bet.settled": {
      const outcome = str(p, "outcome") as BetOutcome;
      return { icon: DicesIcon, text: <>Settled bet “{str(p, "prediction")}”: {BET_OUTCOME_LABELS[outcome]?.toLowerCase() ?? outcome}{str(p, "note") ? ` — ${str(p, "note")}` : ""}</> };
    }
    case "bet.reopened":
      return { icon: RotateCcwIcon, text: <>Reopened bet “{str(p, "prediction")}”</> };
    case "bet.deleted":
      return { icon: Trash2Icon, text: <>Removed bet “{str(p, "prediction")}”</> };
    case "reminder.created":
      return { icon: BellIcon, text: <>Set a reminder: “{str(p, "title")}”, due {str(p, "dueOn")}{str(p, "repeat") ? `, ${str(p, "repeat")}` : ""}</> };
    case "reminder.updated":
      return { icon: PencilIcon, text: <>Edited reminder “{str(p, "title")}” ({changeSummary(p.changes)})</> };
    case "reminder.completed":
      return { icon: CheckIcon, text: <>Done: “{str(p, "title")}”{str(p, "nextDueOn") ? ` (next ${str(p, "nextDueOn")})` : ""}</> };
    case "reminder.skipped":
      return { icon: BellOffIcon, text: <>Skipped reminder “{str(p, "title")}” for {str(p, "on")}{str(p, "nextDueOn") ? ` (next ${str(p, "nextDueOn")})` : ""}</> };
    case "reminder.reopened":
      return { icon: RotateCcwIcon, text: <>Reopened reminder “{str(p, "title")}”</> };
    case "reminder.deleted":
      return { icon: Trash2Icon, text: <>Removed reminder “{str(p, "title")}”</> };
    case "interaction.mentioned":
      return {
        icon: AtSignIcon,
        text: (
          <>
            Mentioned in {str(p, "type")}:{" "}
            <Link to={`/interactions/${e.entityId}`} className="font-medium hover:underline">
              {str(p, "summary")}
            </Link>
          </>
        ),
      };
    case "interaction.created":
      return { icon: PlusIcon, text: <>Logged {str(p, "type")}: {str(p, "summary")}</> };
    case "interaction.updated":
      return {
        icon: PencilIcon,
        text: (
          <>
            Edited interaction{" "}
            <Link to={`/interactions/${e.entityId}`} className="font-medium hover:underline">
              “{str(p, "summary")}”
            </Link>{" "}
            ({changeSummary(p.changes)})
          </>
        ),
      };
    case "interaction.deleted":
      return { icon: Trash2Icon, text: <>Deleted {str(p, "type")}: {str(p, "summary")}</> };
    case "file.uploaded":
      return { icon: FileIcon, text: <>{str(p, "kind") === "avatar" ? "New photo" : `Attached ${str(p, "filename")}`}</> };
    case "file.deleted":
      return { icon: Trash2Icon, text: <>{str(p, "kind") === "avatar" ? "Photo removed" : `Removed attachment ${str(p, "filename")}`}</> };
    default:
      return { icon: SparklesIcon, text: <>{e.eventType}</> };
  }
}

export function ActivityEventItem({ event }: { event: ActivityEventOut }) {
  const { icon: Icon, text } = describeEvent(event);
  return (
    <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <span className="shrink-0 text-xs" title={formatDateTime(event.createdAt)}>
        {formatRelative(event.createdAt)}
      </span>
    </div>
  );
}
