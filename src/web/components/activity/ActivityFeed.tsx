import type { FeedItem } from "@shared/types";
import { InteractionCard } from "@/components/interactions/InteractionCard";
import { LifeEventCard } from "@/components/life-events/LifeEventCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityEventItem } from "./ActivityEventItem";

export function ActivityFeed({
  items,
  currentContactId,
  isPending,
  hasMore,
  isFetchingMore,
  onLoadMore,
}: {
  items: FeedItem[];
  currentContactId: string;
  isPending: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
}) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
        Nothing here yet. Log a call, a coffee, a note, or a life event and it will show up here.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) =>
        item.kind === "interaction" ? (
          <InteractionCard key={`i-${item.interaction.id}`} interaction={item.interaction} currentContactId={currentContactId} />
        ) : item.kind === "lifeEvent" ? (
          <LifeEventCard key={`l-${item.lifeEvent.id}`} lifeEvent={item.lifeEvent} />
        ) : (
          <ActivityEventItem key={`e-${item.event.id}`} event={item.event} />
        ),
      )}
      {hasMore && (
        <Button variant="outline" className="self-center" disabled={isFetchingMore} onClick={onLoadMore}>
          {isFetchingMore ? "Loading…" : "Load older"}
        </Button>
      )}
    </div>
  );
}
