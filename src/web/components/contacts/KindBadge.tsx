import type { ContactKind } from "@shared/schemas/common";
import { Badge } from "@/components/ui/badge";
import { KIND_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

const STYLES: Record<ContactKind, string> = {
  person: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  pet: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  organization: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

export function KindBadge({ kind, className }: { kind: ContactKind; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border", STYLES[kind], className)}>
      {KIND_LABELS[kind]}
    </Badge>
  );
}
