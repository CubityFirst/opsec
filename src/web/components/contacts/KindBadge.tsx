import type { ContactKind } from "@shared/schemas/common";
import { Badge } from "@/components/ui/badge";
import { KIND_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Kinds are told apart by their label alone: the palette stays monochrome. */
export function KindBadge({ kind, className }: { kind: ContactKind; className?: string }) {
  // People are the default; only the other kinds are worth a badge.
  if (kind === "person") return null;
  return (
    <Badge variant="outline" className={cn("font-normal text-muted-foreground", className)}>
      {KIND_LABELS[kind]}
    </Badge>
  );
}
