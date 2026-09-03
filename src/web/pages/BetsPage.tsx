import { DicesIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import type { BetStatus } from "@shared/schemas/bet";
import type { BetRecord } from "@shared/types";
import { BetCard } from "@/components/bets/BetCard";
import { BetDialog } from "@/components/bets/BetDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api";
import { useBets } from "@/lib/queries/bets";
import { ErrorState } from "./ContactsPage";

type Filter = BetStatus | "all";

/** "3 won · 1 lost · 2 open" */
export function describeRecord(r: BetRecord): string {
  const parts = [`${r.won} won`, `${r.lost} lost`];
  if (r.void) parts.push(`${r.void} void`);
  parts.push(`${r.open} open`);
  return parts.join(" · ");
}

export function BetsPage() {
  const [params, setParams] = useSearchParams();
  const filter = (["open", "settled", "all"].includes(params.get("status") ?? "") ? params.get("status") : "open") as Filter;
  const [newOpen, setNewOpen] = useState(false);
  const bets = useBets(filter === "all" ? {} : { status: filter });
  const items = bets.data?.items ?? [];
  const record = bets.data?.record;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <DicesIcon className="size-6 text-muted-foreground" /> Bets
          </h1>
          <p className="text-sm text-muted-foreground">
            Predictions you have staked something on. {record ? describeRecord(record) : "Open bets are listed by review date."}
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <PlusIcon className="size-4" /> Make a bet
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setParams(v === "open" ? {} : { status: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="open">Open{record ? ` (${record.open})` : ""}</TabsTrigger>
          <TabsTrigger value="settled">Settled{record ? ` (${record.won + record.lost + record.void})` : ""}</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {bets.isPending ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : bets.isError ? (
        <ErrorState message={errorMessage(bets.error)} onRetry={() => bets.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filter === "open" ? "No open bets. Make one when you next disagree with someone about the future." : filter === "settled" ? "Nothing settled yet." : "No bets yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((b) => (
            <BetCard key={b.id} bet={b} showContact />
          ))}
        </div>
      )}

      <BetDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
