import { MessageSquarePlusIcon, MilestoneIcon } from "lucide-react";
import { useState } from "react";
import { useOutletContext } from "react-router";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { InteractionDialog } from "@/components/interactions/InteractionDialog";
import { LifeEventDialog } from "@/components/life-events/LifeEventDialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useActivityFeed } from "@/lib/queries/interactions";
import type { ContactOutletContext } from "../ContactDetailPage";
import { ErrorState } from "../ContactsPage";

export function ActivityTab() {
  const { contact } = useOutletContext<ContactOutletContext>();
  const [logOpen, setLogOpen] = useState(false);
  const [lifeOpen, setLifeOpen] = useState(false);
  const feed = useActivityFeed(contact.id);

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Activity</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLifeOpen(true)}>
            <MilestoneIcon /> Life event
          </Button>
          <Button onClick={() => setLogOpen(true)}>
            <MessageSquarePlusIcon /> Log interaction
          </Button>
        </div>
      </div>
      {feed.isError ? (
        <ErrorState message={errorMessage(feed.error)} onRetry={() => feed.refetch()} />
      ) : (
        <ActivityFeed
          items={items}
          currentContactId={contact.id}
          isPending={feed.isPending}
          hasMore={!!feed.hasNextPage}
          isFetchingMore={feed.isFetchingNextPage}
          onLoadMore={() => void feed.fetchNextPage()}
        />
      )}
      <InteractionDialog open={logOpen} onOpenChange={setLogOpen} initialParticipants={[contact]} />
      <LifeEventDialog contactId={contact.id} open={lifeOpen} onOpenChange={setLifeOpen} />
    </div>
  );
}
