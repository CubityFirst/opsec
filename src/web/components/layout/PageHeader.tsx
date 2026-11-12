import { cn } from "@/lib/utils";

/**
 * The one page header: title with its actions on the same line (right-aligned,
 * at every width), and the description underneath at full width so a phone
 * never squeezes it beside a button.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-1", className)}>
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight">{title}</h1>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="max-w-prose text-sm text-pretty text-muted-foreground">{description}</p>}
    </header>
  );
}
