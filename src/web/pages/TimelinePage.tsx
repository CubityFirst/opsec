import { CalendarRangeIcon, ChevronLeftIcon, ChevronRightIcon, DicesIcon, GiftIcon } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { TIMELINE_KINDS, TIMELINE_KIND_LABELS, type TimelineKind } from "@shared/schemas/timeline";
import { LIFE_EVENT_CATEGORY_LABELS } from "@shared/schemas/life-event";
import type { ContactRef, TimelineItem } from "@shared/types";
import { MentionText } from "@/components/MentionText";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { LifeEventIcon, formatEventDate } from "@/components/life-events/LifeEventCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { INTERACTION_LABELS } from "@/lib/format";
import { INTERACTION_ICONS } from "@/lib/interaction-icons";
import { useTimeline } from "@/lib/queries/timeline";
import { cn } from "@/lib/utils";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y! * 12 + (m! - 1) + by;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** First and last day of a YYYY-MM month. */
function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function dayTitle(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** The local calendar day an item belongs to, or null for a life event whose date has no day. */
function dayOf(item: TimelineItem): string | null {
  if (item.kind === "lifeEvent") return item.at.length === 10 ? item.at : null;
  if (item.at.length === 10) return item.at;
  const d = new Date(item.at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function itemKey(item: TimelineItem): string {
  switch (item.kind) {
    case "interaction":
      return `interaction-${item.interaction.id}`;
    case "lifeEvent":
      return `life-${item.lifeEvent.id}`;
    case "gift":
      return `gift-${item.gift.id}`;
    case "bet":
      return `bet-${item.event}-${item.bet.id}`;
  }
}

type Group = { key: string; title: string; items: TimelineItem[] };

/** Group by local day, newest first; month- or year-only life events go into a trailing "sometime" group. */
function groupByDay(items: TimelineItem[]): Group[] {
  const byDay = new Map<string, TimelineItem[]>();
  const undated: TimelineItem[] = [];
  for (const item of items) {
    const day = dayOf(item);
    if (!day) {
      undated.push(item);
      continue;
    }
    const list = byDay.get(day) ?? [];
    list.push(item);
    byDay.set(day, list);
  }
  const groups = [...byDay.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([day, list]) => ({ key: day, title: dayTitle(day), items: list }));
  if (undated.length) groups.push({ key: "sometime", title: "Sometime this month, or this year", items: undated });
  return groups;
}

function People({ people }: { people: ContactRef[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {people.map((p) => (
        <Link key={p.id} to={`/contacts/${p.id}`} className="flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 text-xs hover:bg-muted">
          <ContactAvatar contact={p} className="size-4" />
          {p.displayName}
        </Link>
      ))}
    </span>
  );
}

function Row({ icon, time, children, aside }: { icon: React.ReactNode; time?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:size-3.5" aria-hidden>
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          {time && <span className="text-xs tabular-nums text-muted-foreground">{time}</span>}
          {children}
        </div>
        {aside}
      </div>
    </li>
  );
}

function Item({ item }: { item: TimelineItem }) {
  switch (item.kind) {
    case "interaction": {
      const i = item.interaction;
      const Icon = INTERACTION_ICONS[i.type];
      return (
        <Row icon={<Icon />} time={timeOf(i.occurredAt)} aside={i.participants.length > 0 && <People people={i.participants} />}>
          <Badge variant="outline" className="font-normal">
            {INTERACTION_LABELS[i.type]}
          </Badge>
          <Link to={`/interactions/${i.id}`} className="font-medium hover:underline">
            <MentionText text={i.summary} />
          </Link>
        </Row>
      );
    }
    case "lifeEvent": {
      const l = item.lifeEvent;
      return (
        <Row icon={<LifeEventIcon category={l.category} />} aside={<People people={[item.contact]} />}>
          <Badge variant="secondary" className="font-normal">
            {LIFE_EVENT_CATEGORY_LABELS[l.category]}
          </Badge>
          <span className="font-medium">{l.title}</span>
          {l.occurredOn.length < 10 && <span className="text-xs text-muted-foreground">{formatEventDate(l.occurredOn)}</span>}
        </Row>
      );
    }
    case "gift": {
      const g = item.gift;
      return (
        <Row icon={<GiftIcon />} aside={<People people={[g.contact]} />}>
          <Badge variant="secondary" className="font-normal">
            {g.status === "received" ? "Gift received" : "Gift given"}
          </Badge>
          <span className="font-medium">{g.name}</span>
          {g.occasion && <span className="text-xs text-muted-foreground">{g.occasion}</span>}
        </Row>
      );
    }
    case "bet": {
      const b = item.bet;
      const outcome = b.outcome === "me" ? "you were right" : b.outcome === "them" ? "they were right" : b.outcome === "void" ? "called off" : null;
      return (
        <Row icon={<DicesIcon />} time={item.event === "settled" ? timeOf(item.at) : undefined} aside={<People people={[b.contact]} />}>
          <Badge variant="secondary" className="font-normal">
            {item.event === "settled" ? "Bet settled" : "Bet made"}
          </Badge>
          <span className="font-medium">{b.prediction}</span>
          {item.event === "settled" && outcome && <span className="text-xs text-muted-foreground">{outcome}</span>}
          {item.event === "made" && b.wager && <span className="text-xs text-muted-foreground">for {b.wager}</span>}
        </Row>
      );
    }
  }
}

export function TimelinePage() {
  const [params, setParams] = useSearchParams();
  const rawMonth = params.get("month");
  const month = rawMonth && MONTH_RE.test(rawMonth) ? rawMonth : thisMonth();
  const rawKinds = params.get("kinds");
  const kinds = useMemo<TimelineKind[]>(() => (rawKinds === null ? [...TIMELINE_KINDS] : TIMELINE_KINDS.filter((k) => rawKinds.split(",").includes(k))), [rawKinds]);
  const { from, to } = monthBounds(month);
  const result = useTimeline(from, to, kinds);
  const groups = useMemo(() => groupByDay(result.data?.items ?? []), [result.data]);

  const update = (next: { month?: string; kinds?: TimelineKind[] }) => {
    const p = new URLSearchParams(params);
    const m = next.month ?? month;
    if (m === thisMonth()) p.delete("month");
    else p.set("month", m);
    const k = next.kinds ?? kinds;
    if (k.length === TIMELINE_KINDS.length) p.delete("kinds");
    else p.set("kinds", k.join(","));
    setParams(p);
  };
  const toggleKind = (k: TimelineKind) => update({ kinds: kinds.includes(k) ? kinds.filter((x) => x !== k) : TIMELINE_KINDS.filter((x) => x === k || kinds.includes(x)) });

  const counts = result.data?.counts;
  const total = counts ? kinds.reduce((n, k) => n + counts[k], 0) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
        <p className="text-sm text-muted-foreground">Everything that happened in a month, across everyone: interactions, life events, gifts and bets.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => update({ month: shiftMonth(month, -1) })}>
            <ChevronLeftIcon />
          </Button>
          <Input type="month" aria-label="Month" value={month} onChange={(e) => MONTH_RE.test(e.target.value) && update({ month: e.target.value })} className="w-44" />
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => update({ month: shiftMonth(month, 1) })}>
            <ChevronRightIcon />
          </Button>
          {month !== thisMonth() && (
            <Button variant="ghost" size="sm" onClick={() => update({ month: thisMonth() })}>
              This month
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show">
          {TIMELINE_KINDS.map((k) => {
            const on = kinds.includes(k);
            return (
              <Button key={k} type="button" size="sm" variant={on ? "secondary" : "outline"} aria-pressed={on} onClick={() => toggleKind(k)} className={cn(!on && "text-muted-foreground")}>
                {TIMELINE_KIND_LABELS[k]}
                {counts && <span className="ml-1 tabular-nums opacity-70">{counts[k]}</span>}
              </Button>
            );
          })}
        </div>
      </div>

      {result.isPending ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : result.isError ? (
        <p className="text-sm text-destructive">{errorMessage(result.error)}</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <CalendarRangeIcon className="size-6" />
            {kinds.length === 0 ? "Pick at least one kind above." : `Nothing in ${monthTitle(month)}.`}
          </CardContent>
        </Card>
      ) : (
        <div className={cn("flex flex-col gap-6", result.isPlaceholderData && "opacity-60")}>
          <p className="text-xs text-muted-foreground">
            {total} {total === 1 ? "entry" : "entries"} in {monthTitle(month)}
          </p>
          {groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-1">
              <h2 className="text-sm font-medium text-muted-foreground">{g.title}</h2>
              <Card className="py-1">
                <CardContent className="px-4">
                  <ul className="divide-y">
                    {g.items.map((item) => (
                      <Item key={itemKey(item)} item={item} />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
