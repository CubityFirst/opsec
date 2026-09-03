import { Badge } from "@/components/ui/badge";
import { formatBirthday } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Marker for a contact who has died. Rendered wherever a contact is referenced
 * (list rows, headers, relationship rows, peeks) so the state is never missed.
 */
export function DeceasedBadge({ on, className }: { on?: string | null; className?: string }) {
  const date = on ? formatBirthday(on).split(" (")[0] : null;
  return (
    <Badge variant="outline" className={cn("border-border bg-muted/60 text-muted-foreground", className)} title={date ? `Died ${date}` : "Deceased"}>
      † {date ? `Died ${date}` : "Deceased"}
    </Badge>
  );
}
