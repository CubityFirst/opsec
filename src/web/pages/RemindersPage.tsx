import { BellIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { ReminderOut } from "@shared/types";
import { ReminderCard, daysUntil } from "@/components/reminders/ReminderCard";
import { ReminderDialog } from "@/components/reminders/ReminderDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api";
import { useReminders } from "@/lib/queries/reminders";

type Bucket = { key: string; title: string; items: ReminderOut[] };

/** Open reminders grouped by how soon they are due. */
function bucket(items: ReminderOut[], now: Date): Bucket[] {
  const groups: Bucket[] = [
    { key: "overdue", title: "Overdue", items: [] },
    { key: "today", title: "Today", items: [] },
    { key: "week", title: "Next 7 days", items: [] },
    { key: "month", title: "Next 30 days", items: [] },
    { key: "later", title: "Later", items: [] },
  ];
  for (const r of items) {
    const n = daysUntil(r.dueOn, now);
    const g = n < 0 ? 0 : n === 0 ? 1 : n <= 7 ? 2 : n <= 30 ? 3 : 4;
    groups[g]!.items.push(r);
  }
  return groups.filter((g) => g.items.length > 0);
}

export function RemindersPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") === "done" ? "done" : "open";
  const [newOpen, setNewOpen] = useState(false);
  const list = useReminders({ status });
  const now = useMemo(() => new Date(), []);
  const items = list.data?.items ?? [];
  const groups = useMemo(() => (status === "open" ? bucket(items, now) : []), [items, status, now]);
  const counts = list.data?.counts;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reminders</h1>
          <p className="text-sm text-muted-foreground">Things to do, once or on a schedule, about the people in your life or nobody in particular.</p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <PlusIcon className="size-4" /> New reminder
        </Button>
      </div>

      <Tabs value={status} onValueChange={(v) => setParams(v === "open" ? {} : { status: v })}>
        <TabsList>
          <TabsTrigger value="open">Open{counts ? ` (${counts.open})` : ""}</TabsTrigger>
          <TabsTrigger value="done">Done{counts ? ` (${counts.done})` : ""}</TabsTrigger>
        </TabsList>
      </Tabs>

      {list.isPending ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <p className="text-sm text-destructive">{errorMessage(list.error)}</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <BellIcon className="size-6" />
            {status === "open" ? "Nothing to do. Set a reminder for a call to make, a birthday present to buy, or a bill that comes round every month." : "Nothing finished yet."}
          </CardContent>
        </Card>
      ) : status === "open" ? (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                {g.title} <span className="font-normal">({g.items.length})</span>
              </h2>
              {g.items.map((r) => (
                <ReminderCard key={r.id} reminder={r} showContact />
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((r) => (
            <ReminderCard key={r.id} reminder={r} showContact />
          ))}
        </div>
      )}

      <ReminderDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
