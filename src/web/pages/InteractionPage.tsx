import { MentionText } from "@/components/MentionText";
import { ArrowLeftIcon } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { InteractionCard } from "@/components/interactions/InteractionCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, errorMessage } from "@/lib/api";
import { INTERACTION_LABELS, formatDateTime } from "@/lib/format";
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
  if (query.isPending) return <Skeleton className="h-40 w-full max-w-3xl" />;

  const i = query.data;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}>
          <ArrowLeftIcon /> Back
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          <MentionText text={i.summary} />
        </h1>
        <p className="text-sm text-muted-foreground">
          {INTERACTION_LABELS[i.type]} · {formatDateTime(i.occurredAt)} · with{" "}
          {i.participants.map((p, idx) => (
            <span key={p.id}>
              {idx > 0 && ", "}
              <Link to={`/contacts/${p.id}`} className="font-medium text-foreground hover:underline">
                {p.displayName}
              </Link>
            </span>
          ))}
        </p>
      </div>
      <InteractionCard interaction={i} currentContactId="" />
    </div>
  );
}
