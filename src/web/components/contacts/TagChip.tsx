import { XIcon } from "lucide-react";
import type { TagOut } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function TagChip({
  tag,
  onRemove,
  className,
}: {
  tag: Pick<TagOut, "name" | "color">;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("gap-1 font-normal", className)}
      style={tag.color ? { backgroundColor: `${tag.color}22`, color: tag.color, borderColor: `${tag.color}55` } : undefined}
    >
      {tag.name}
      {onRemove && (
        <button type="button" aria-label={`Remove tag ${tag.name}`} onClick={onRemove} className="-mr-0.5 rounded-full hover:opacity-70">
          <XIcon className="size-3" />
        </button>
      )}
    </Badge>
  );
}
