import { CalendarDaysIcon, CopyIcon, ExternalLinkIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CALENDAR_SOURCE_LABELS, type CalendarFeedOut } from "@shared/schemas/calendar";
import { CalendarFeedDialog } from "@/components/settings/CalendarFeedDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { feedUrls, useCalendarFeeds, useDeleteCalendarFeed, useRotateCalendarFeed } from "@/lib/queries/calendar";

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Could not copy; select the text instead");
  }
}

/** iCalendar subscription feeds: each one picks its own sources and has its own secret URL. */
export function CalendarFeedsCard() {
  const feeds = useCalendarFeeds();
  const rotate = useRotateCalendarFeed();
  const remove = useDeleteCalendarFeed();
  const [dialog, setDialog] = useState<{ open: boolean; feed?: CalendarFeedOut }>({ open: false });
  const [confirming, setConfirming] = useState<{ id: string; action: "rotate" | "delete" } | null>(null);

  const onRotate = (f: CalendarFeedOut) =>
    rotate.mutate(f.id, {
      onSuccess: () => {
        setConfirming(null);
        toast.success("New URL issued; the old one no longer works");
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  const onDelete = (f: CalendarFeedOut) =>
    remove.mutate(f.id, {
      onSuccess: () => {
        setConfirming(null);
        toast.success("Feed deleted");
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDaysIcon className="size-4" /> Calendar feeds
        </CardTitle>
        <CardDescription>
          Subscribe from Google Calendar, Apple Calendar, Outlook or anything that reads iCalendar. Each feed chooses what it carries; times are in UTC and your
          calendar app shows them in your zone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {feeds.data && feeds.data.length > 0 && (
          <ul className="flex flex-col divide-y rounded-md border text-sm">
            {feeds.data.map((f) => {
              const urls = feedUrls(f.key);
              const pending = confirming?.id === f.id ? confirming.action : null;
              return (
                <li key={f.id} className="flex flex-col gap-2 px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
                      <CalendarDaysIcon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{f.name}</span>
                        {f.sources.map((s) => (
                          <Badge key={s} variant="secondary">
                            {CALENDAR_SOURCE_LABELS[s].label}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>created {formatRelative(f.createdAt)}</span>
                        <span aria-hidden>·</span>
                        <span>{f.lastFetchedAt ? `last fetched ${formatRelative(f.lastFetchedAt)}` : "never fetched"}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {pending ? (
                        <>
                          <Button type="button" size="sm" variant="destructive" disabled={rotate.isPending || remove.isPending} onClick={() => (pending === "rotate" ? onRotate(f) : onDelete(f))}>
                            {pending === "rotate" ? "Confirm new URL" : "Confirm delete"}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button type="button" size="sm" variant="ghost" aria-label={`Edit ${f.name}`} onClick={() => setDialog({ open: true, feed: f })}>
                            <PencilIcon /> Edit
                          </Button>
                          <Button type="button" size="sm" variant="ghost" aria-label={`Issue a new URL for ${f.name}`} onClick={() => setConfirming({ id: f.id, action: "rotate" })}>
                            <RefreshCwIcon /> New URL
                          </Button>
                          <Button type="button" size="sm" variant="ghost" aria-label={`Delete ${f.name}`} onClick={() => setConfirming({ id: f.id, action: "delete" })}>
                            <Trash2Icon /> Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-11">
                    <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">{urls.https}</code>
                    <Button type="button" size="sm" variant="outline" onClick={() => void copy(urls.https, "Feed URL")}>
                      <CopyIcon /> Copy
                    </Button>
                    <Button type="button" size="sm" variant="outline" asChild>
                      <a href={urls.webcal} title="Open in your calendar app (webcal)">
                        <ExternalLinkIcon /> Subscribe
                      </a>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {feeds.data && feeds.data.length === 0 && <p className="text-sm text-muted-foreground">No feeds yet.</p>}

        <div>
          <Button type="button" size="sm" onClick={() => setDialog({ open: true })}>
            <PlusIcon /> New feed
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Anyone with a feed URL can read it, so treat it like a password: use “New URL” if one leaks. In Google Calendar, paste the URL under Other calendars →
          From URL; “Subscribe” opens it in Apple Calendar or Outlook.
        </p>
      </CardContent>

      <CalendarFeedDialog feed={dialog.feed} open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </Card>
  );
}
