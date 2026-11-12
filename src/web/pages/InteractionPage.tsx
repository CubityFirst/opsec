import { plainMentions } from "@shared/mentions";
import { ArrowLeftIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { InteractionCard } from "@/components/interactions/InteractionCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, errorMessage } from "@/lib/api";
import { INTERACTION_LABELS } from "@/lib/format";
import { useInteraction } from "@/lib/queries/interactions";
import { ErrorState } from "./ContactsPage";

/** A single interaction with all its participants; the target of "mentioned in…" links. */
export function InteractionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const query = useInteraction(id);

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return <ErrorState message={notFound ? "This interaction no longer exists." : errorMessage(query.error)} onRetry={notFound ? undefined : () => query.refetch()} />;
  }
  if (query.isPending) return <Skeleton className="h-40 w-full" />;

  const i = query.data;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Button variant="ghost" size="sm" className="-ml-2.5 self-start" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}>
        <ArrowLeftIcon /> Back
      </Button>
      {/* The card says it all (type, date, title, people); the heading is for the document outline. */}
      <h1 className="sr-only">
        {INTERACTION_LABELS[i.type]}: {plainMentions(i.summary)}
      </h1>
      <InteractionCard interaction={i} currentContactId="" fullDate />
    </div>
  );
}
