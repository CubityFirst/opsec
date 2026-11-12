import { BellIcon, CakeIcon, ClockIcon, DicesIcon, MessageSquareIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { ContactSummary } from "@shared/types";
import { describeReview } from "@/components/bets/BetCard";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { OutOfTouchSettingsDialog } from "@/components/dashboard/OutOfTouchSettingsDialog";
import { InteractionCard } from "@/components/interactions/InteractionCard";
import { InteractionDialog } from "@/components/interactions/InteractionDialog";
import { describeDue } from "@/components/reminders/ReminderCard";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { formatBirthday, formatRelative, parseBirthday } from "@/lib/format";
import { useAuthUser } from "@/lib/queries/auth";
import { useBets } from "@/lib/queries/bets";
import { useContacts } from "@/lib/queries/contacts";
import { useGifts } from "@/lib/queries/gifts";
import { useRecentInteractions } from "@/lib/queries/interactions";
import { useReminders } from "@/lib/queries/reminders";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a silence has to last before the dashboard mentions it. */
const QUIET_DAYS = 30;

/** Days until the next occurrence of a month/day, ignoring the year. */
function daysUntilBirthday(birthday: string | null, now: Date): number | null {
  const p = parseBirthday(birthday);
  if (!p || !p.month || !p.day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), p.month - 1, p.day);
  if (next < today) next = new Date(today.getFullYear() + 1, p.month - 1, p.day);
  return Math.round((next.getTime() - today.getTime()) / DAY_MS);
}

/** One line of a dashboard panel: avatar, a title with an optional second line, and a short trailing status. */
function PanelRow({
  to,
  leading,
  title,
  sub,
  trailing,
  tone,
}: {
  to: string;
  leading: React.ReactNode;
  title: string;
  sub?: string;
  trailing?: string;
  /** Colour for the trailing status: overdue / due today are the only highlights. */
  tone?: "overdue" | "due";
}) {
  return (
    <li>
      <Link to={to} className="-mx-1 flex items-start gap-3 rounded-md px-1 py-1.5 hover:bg-accent">
        {leading}
        <span className="min-w-0 flex-1 self-center">
          <span className="block text-sm leading-snug font-medium text-pretty [overflow-wrap:anywhere]">{title}</span>
          {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
        </span>
        {trailing && (
          <span
            className={cn(
              "shrink-0 text-right text-xs whitespace-nowrap",
              sub ? "mt-0.5" : "self-center",
              tone === "overdue" ? "font-medium text-rose-700 dark:text-rose-400" : tone === "due" ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground",
            )}
          >
            {trailing}
          </span>
        )}
      </Link>
    </li>
  );
}

function SidePanel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: typeof CakeIcon;
  /** Optional control in the header, e.g. the Out of touch settings button. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** One line of the Out of touch list: a real silence, or a contact nothing has ever been logged against. */
type QuietContact = { c: ContactSummary; since: number; never: boolean };

/**
 * What the Out of touch panel says when it has nothing to list. "You have spoken
 * to everyone" is only true when there is someone to have spoken to and nobody
 * is missing from the check, so the no-people, all-muted and nothing-logged
 * cases each get their own line, and the people the panel is not counting are
 * always accounted for underneath.
 */
function quietEmptyState(
  stats: { people: number; tracked: number; spoken: number; never: number },
  includeNever: boolean,
): { text: string; hint?: string } {
  const n = stats.never;
  // The never-spoken-to people the panel is not listing: either because the
  // preference leaves them out, or because they are too newly added to count.
  const neverHint = includeNever
    ? `${n === 1 ? "One person has" : `${n} people have`} nothing logged yet; they turn up here a month after you added them.`
    : `${n === 1 ? "One person has" : `${n} people have`} nothing logged at all, so they are left out.`;

  if (stats.people === 0) return { text: "No people yet. Add someone and this is where a long silence turns up." };
  if (stats.tracked === 0) {
    return {
      text: `Keep-in-touch nudges are off for ${stats.people === 1 ? "the one person you have" : `all ${stats.people} people you have`}.`,
      hint: "Turn them back on in the settings above.",
    };
  }
  if (stats.spoken === 0) {
    return {
      text: `Nothing logged yet for the ${stats.tracked === 1 ? "one person" : `${stats.tracked} people`} you keep up with.`,
      hint: includeNever ? "They turn up here a month after you added them." : "Log an interaction, or count people you have never spoken to in the settings above.",
    };
  }
  return {
    text: `You have spoken to everyone in the last ${QUIET_DAYS} days.`,
    hint: n === 0 ? undefined : neverHint,
  };
}

function QuietEmpty({ stats, includeNever }: { stats: Parameters<typeof quietEmptyState>[0]; includeNever: boolean }) {
  const { text, hint } = quietEmptyState(stats, includeNever);
  return (
    <>
      <p className="text-sm text-muted-foreground">{text}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
}

export function DashboardPage() {
  const [logOpen, setLogOpen] = useState(false);
  const [quietSettingsOpen, setQuietSettingsOpen] = useState(false);
  const recent = useRecentInteractions(20);
  const contacts = useContacts({ limit: 200 });
  // Whether "Out of touch" also counts people with nothing logged; the choice
  // lives on the user, so it follows them between browsers.
  const includeNever = useAuthUser()?.preferences.outOfTouchIncludeNever ?? false;

  const now = useMemo(() => new Date(), []);
  // Open bets whose review point is within the next two weeks (or already past).
  const dueBy = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [now]);
  const dueBets = useBets({ dueBy, limit: 8 });
  // Reminders that are overdue, due today or due within the week.
  const weekEnd = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [now]);
  const dueReminders = useReminders({ dueBy: weekEnd, limit: 8 });
  // Gift ideas, so an upcoming birthday can say how many are waiting.
  const ideas = useGifts({ status: "idea" });
  const ideaCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of ideas.data?.items ?? []) m.set(g.contact.id, (m.get(g.contact.id) ?? 0) + 1);
    return m;
  }, [ideas.data]);
  const { birthdays, outOfTouch, quietStats } = useMemo(() => {
    const items = contacts.data?.items ?? [];
    const birthdays = items
      .map((c) => ({ c, days: daysUntilBirthday(c.birthday ?? null, now) }))
      .filter((x): x is { c: ContactSummary; days: number } => x.days !== null && x.days <= 30)
      .sort((a, b) => a.days - b.days)
      .slice(0, 8);
    // People only, and never the ones with keep-in-touch switched off. A contact
    // with no logged interaction is "no data" rather than a silence, so it only
    // counts when the preference says so — and then the date the contact was
    // added stands in for the last word, so someone added yesterday is not
    // already overdue.
    const people = items.filter((c) => c.kind === "person");
    const tracked = people.filter((c) => c.keepInTouch);
    const rows: QuietContact[] = [];
    for (const c of tracked) {
      const never = !c.lastInteraction;
      if (never && !includeNever) continue;
      const since = new Date(never ? c.createdAt : c.lastInteraction!.occurredAt).getTime();
      if (now.getTime() - since > QUIET_DAYS * DAY_MS) rows.push({ c, since, never });
    }
    rows.sort((a, b) => a.since - b.since);
    return {
      birthdays,
      outOfTouch: rows.slice(0, 8),
      quietStats: {
        people: people.length,
        tracked: tracked.length,
        spoken: tracked.filter((c) => c.lastInteraction).length,
        never: tracked.filter((c) => !c.lastInteraction).length,
      },
    };
  }, [contacts.data, now, includeNever]);

  const interactions = recent.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="What has been happening with the people in your life."
        actions={
          <Button onClick={() => setLogOpen(true)}>
            <PlusIcon /> Log interaction
          </Button>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MessageSquareIcon className="size-4" /> Recent interactions
          </h2>
          {recent.isPending ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : recent.isError ? (
            <p className="text-sm text-destructive">{errorMessage(recent.error)}</p>
          ) : interactions.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nothing logged yet. Log a call, a coffee, or a text to start the timeline.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {interactions.map((i) => (
                  <InteractionCard key={i.id} interaction={i} currentContactId="" hoverActions />
                ))}
              </div>
              {recent.hasNextPage && (
                <Button variant="outline" className="self-center" onClick={() => void recent.fetchNextPage()} disabled={recent.isFetchingNextPage}>
                  {recent.isFetchingNextPage ? "Loading…" : "Load older"}
                </Button>
              )}
            </>
          )}
        </section>

        {/* First on narrow screens so it is not buried under the list; pinned on wide ones. */}
        <aside className="order-1 flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:order-2">
          <SidePanel title="Reminders" icon={BellIcon}>
            {dueReminders.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : (dueReminders.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing due this week.{" "}
                <Link to="/reminders" className="underline">
                  All reminders
                </Link>
              </p>
            ) : (
              <>
                <ul className="flex flex-col">
                  {dueReminders.data!.items.map((r) => {
                    const d = describeDue(r.dueOn, now);
                    return (
                      <PanelRow
                        key={r.id}
                        to={r.contact ? `/contacts/${r.contact.id}` : "/reminders"}
                        leading={
                          r.contact ? (
                            <ContactAvatar contact={r.contact} className="size-8" />
                          ) : (
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              <BellIcon className="size-4" />
                            </span>
                          )
                        }
                        title={r.title}
                        sub={r.contact ? `about ${r.contact.displayName}` : undefined}
                        trailing={d.text}
                        tone={d.overdue ? "overdue" : d.due ? "due" : undefined}
                      />
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  {dueReminders.data!.total > dueReminders.data!.items.length ? `${dueReminders.data!.total - dueReminders.data!.items.length} more. ` : ""}
                  <Link to="/reminders" className="underline">
                    All reminders
                  </Link>
                </p>
              </>
            )}
          </SidePanel>

          {(dueBets.data?.items.length ?? 0) > 0 && (
            <SidePanel title="Bets to settle" icon={DicesIcon}>
              <ul className="flex flex-col">
                {dueBets.data!.items.map((b) => {
                  const r = describeReview(b.reviewOn, now);
                  return (
                    <PanelRow
                      key={b.id}
                      to={`/contacts/${b.contact.id}`}
                      leading={<ContactAvatar contact={b.contact} className="size-8" />}
                      title={b.prediction}
                      sub={`with ${b.contact.displayName}${b.wager ? ` · ${b.wager}` : ""}`}
                      trailing={r.text}
                      tone={r.due ? "due" : undefined}
                    />
                  );
                })}
              </ul>
              {dueBets.data!.total > dueBets.data!.items.length && (
                <p className="mt-2 text-xs text-muted-foreground">{dueBets.data!.total - dueBets.data!.items.length} more waiting on their contacts' pages.</p>
              )}
            </SidePanel>
          )}

          <SidePanel title="Upcoming birthdays" icon={CakeIcon}>
            {contacts.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : birthdays.length === 0 ? (
              <p className="text-sm text-muted-foreground">None in the next 30 days.</p>
            ) : (
              <ul className="flex flex-col">
                {birthdays.map(({ c, days }) => {
                  const n = ideaCounts.get(c.id) ?? 0;
                  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
                  const date = formatBirthday(c.birthday ?? null, now).split(" (")[0];
                  return (
                    <PanelRow
                      key={c.id}
                      to={`/contacts/${c.id}`}
                      leading={<ContactAvatar contact={c} className="size-8" />}
                      title={c.displayName}
                      sub={n ? `${date} · ${n} gift ${n === 1 ? "idea" : "ideas"}` : date}
                      trailing={when}
                      tone={days === 0 ? "due" : undefined}
                    />
                  );
                })}
              </ul>
            )}
          </SidePanel>

          <SidePanel
            title="Out of touch"
            icon={ClockIcon}
            action={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Out of touch settings"
                title="Out of touch settings"
                onClick={() => setQuietSettingsOpen(true)}
              >
                <SettingsIcon />
              </Button>
            }
          >
            {contacts.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : outOfTouch.length === 0 ? (
              <QuietEmpty stats={quietStats} includeNever={includeNever} />
            ) : (
              <ul className="flex flex-col">
                {outOfTouch.map(({ c, never }) => (
                  <PanelRow
                    key={c.id}
                    to={`/contacts/${c.id}`}
                    leading={<ContactAvatar contact={c} className="size-8" />}
                    title={c.displayName}
                    sub={never ? "Nothing logged yet" : `Last: ${c.lastInteraction?.summary ?? "interaction"}`}
                    trailing={never ? "never" : formatRelative(c.lastInteraction?.occurredAt)}
                  />
                ))}
              </ul>
            )}
          </SidePanel>
        </aside>
      </div>

      <InteractionDialog open={logOpen} onOpenChange={setLogOpen} initialParticipants={[]} />
      <OutOfTouchSettingsDialog open={quietSettingsOpen} onOpenChange={setQuietSettingsOpen} />
    </div>
  );
}
