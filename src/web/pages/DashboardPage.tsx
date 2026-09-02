import { CakeIcon, ClockIcon, MessageSquareIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { ContactSummary } from "@shared/types";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { InteractionCard } from "@/components/interactions/InteractionCard";
import { InteractionDialog } from "@/components/interactions/InteractionDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { formatBirthday, formatRelative, parseBirthday } from "@/lib/format";
import { useAuthUser } from "@/lib/queries/auth";
import { useContacts } from "@/lib/queries/contacts";
import { useRecentInteractions } from "@/lib/queries/interactions";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days until the next occurrence of a month/day, ignoring the year. */
function daysUntilBirthday(birthday: string | null, now: Date): number | null {
  const p = parseBirthday(birthday);
  if (!p || !p.month || !p.day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), p.month - 1, p.day);
  if (next < today) next = new Date(today.getFullYear() + 1, p.month - 1, p.day);
  return Math.round((next.getTime() - today.getTime()) / DAY_MS);
}

function ContactRow({ contact, meta }: { contact: ContactSummary; meta: string }) {
  return (
    <li>
      <Link to={`/contacts/${contact.id}`} className="flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-accent">
        <ContactAvatar contact={contact} className="size-8" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{contact.displayName}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
      </Link>
    </li>
  );
}

function SidePanel({ title, icon: Icon, children }: { title: string; icon: typeof CakeIcon; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const [logOpen, setLogOpen] = useState(false);
  const recent = useRecentInteractions(20);
  const contacts = useContacts({ limit: 200 });
  const showDetails = useAuthUser()?.preferences.dashboardShowContactDetails ?? true;

  const now = useMemo(() => new Date(), []);
  const { birthdays, outOfTouch } = useMemo(() => {
    const items = contacts.data?.items ?? [];
    const birthdays = items
      .map((c) => ({ c, days: daysUntilBirthday(c.birthday ?? null, now) }))
      .filter((x): x is { c: ContactSummary; days: number } => x.days !== null && x.days <= 30)
      .sort((a, b) => a.days - b.days)
      .slice(0, 8);
    // Only people you have actually spoken to before; contacts with no logged
    // interaction are "no data", not out of touch.
    const outOfTouch = items
      .filter((c) => c.kind === "person" && c.lastInteraction)
      .map((c) => ({ c, last: new Date(c.lastInteraction!.occurredAt).getTime() }))
      .filter((x) => now.getTime() - x.last > 30 * DAY_MS)
      .sort((a, b) => a.last - b.last)
      .slice(0, 8);
    return { birthdays, outOfTouch };
  }, [contacts.data, now]);

  const interactions = recent.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            What has been happening with the people in your life.
            {!showDetails && (
              <>
                {" "}
                Contact details are hidden (
                <Link to="/account" className="underline">
                  change
                </Link>
                ).
              </>
            )}
          </p>
        </div>
        <Button onClick={() => setLogOpen(true)}>
          <PlusIcon className="size-4" /> Log interaction
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <section className="order-2 flex flex-col gap-3 lg:order-1">
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
                  <InteractionCard key={i.id} interaction={i} currentContactId="" maskContacts={!showDetails} />
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
        <aside className="order-1 flex flex-col gap-4 lg:sticky lg:top-6 lg:order-2">
          <SidePanel title="Upcoming birthdays" icon={CakeIcon}>
            {contacts.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : birthdays.length === 0 ? (
              <p className="text-sm text-muted-foreground">None in the next 30 days.</p>
            ) : !showDetails ? (
              <p className="text-sm text-muted-foreground">
                {birthdays.length} in the next 30 days.{" "}
                <Link to="/contacts" className="underline">
                  Open contacts
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col">
                {birthdays.map(({ c, days }) => (
                  <ContactRow key={c.id} contact={c} meta={days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days · ${formatBirthday(c.birthday ?? null, now).split(" (")[0]}`} />
                ))}
              </ul>
            )}
          </SidePanel>

          <SidePanel title="Out of touch" icon={ClockIcon}>
            {contacts.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : outOfTouch.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have spoken to everyone in the last month.</p>
            ) : !showDetails ? (
              <p className="text-sm text-muted-foreground">
                {outOfTouch.length} {outOfTouch.length === 1 ? "person" : "people"} not spoken to in over a month.{" "}
                <Link to="/contacts?sort=lastContacted" className="underline">
                  Open contacts
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col">
                {outOfTouch.map(({ c }) => (
                  <ContactRow key={c.id} contact={c} meta={formatRelative(c.lastInteraction?.occurredAt)} />
                ))}
              </ul>
            )}
          </SidePanel>
        </aside>
      </div>

      <InteractionDialog open={logOpen} onOpenChange={setLogOpen} initialParticipants={[]} />
    </div>
  );
}
