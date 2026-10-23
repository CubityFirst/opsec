import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** A larger look at images attached in Ask; with several, arrows (and the arrow keys) step through them. */
export function ImagePreviewDialog({
  images,
  index,
  onIndexChange,
}: {
  images: { previewUrl: string; file: File }[];
  /** The image shown; null = closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const current = index === null ? undefined : images[index];
  const many = images.length > 1;
  const step = (by: number) => index !== null && onIndexChange((index + by + images.length) % images.length);

  return (
    <Dialog open={!!current} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent
        className="w-auto max-w-[min(98vw,120rem)] p-2 sm:max-w-[min(98vw,120rem)] sm:p-3"
        onKeyDown={(e) => {
          if (!many) return;
          if (e.key === "ArrowLeft") step(-1);
          else if (e.key === "ArrowRight") step(1);
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{many && index !== null ? `Image ${index + 1} of ${images.length}` : "Image"}</DialogTitle>
          <DialogDescription>Larger preview of an attached image</DialogDescription>
        </DialogHeader>
        {current && <img src={current.previewUrl} alt="" className="mx-auto max-h-[calc(92vh-4.5rem)] w-auto max-w-full rounded-md object-contain" />}
        {many && index !== null && (
          <div className="flex items-center justify-center gap-3 px-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous image" onClick={() => step(-1)}>
              <ChevronLeftIcon />
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {index + 1} / {images.length}
            </span>
            <Button variant="outline" size="icon-sm" aria-label="Next image" onClick={() => step(1)}>
              <ChevronRightIcon />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
