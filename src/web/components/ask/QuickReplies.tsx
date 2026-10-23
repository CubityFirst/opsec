import { Button } from "@/components/ui/button";

/** One-tap answers to the assistant's question, shown inside the composer above the text box; typing works too. */
export function QuickReplies({ replies, onPick, disabled }: { replies: string[]; onPick: (text: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-dashed px-1 pt-0.5 pb-2" role="group" aria-label="Suggested replies">
      {replies.map((r) => (
        <Button
          key={r}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-auto whitespace-normal rounded-full border-primary/45 bg-background text-left hover:border-primary hover:bg-primary/10"
          onClick={() => onPick(r)}
        >
          {r}
        </Button>
      ))}
    </div>
  );
}
