import { useEffect } from "react";

/** How far the finger must travel horizontally before it counts as a swipe. */
const THRESHOLD = 60;
/** Vertical drift allowed, as a fraction of the horizontal travel: anything steeper is a scroll. */
const OFF_AXIS = 0.6;
/** A swipe is a flick, not a slow drag that happened to end elsewhere. */
const MAX_MS = 700;
/** Elements that own horizontal drags themselves; `data-no-swipe` is the escape hatch for new ones. */
const OWN_GESTURE = "input, textarea, select, [contenteditable], [role='slider'], .leaflet-container, [data-no-swipe]";

/** A scrollable ancestor (a wide table, a code block) gets the gesture instead of the drawer. */
function scrollsHorizontally(el: Element): boolean {
  if (el.scrollWidth <= el.clientWidth + 2) return false;
  const overflowX = getComputedStyle(el).overflowX;
  return overflowX === "auto" || overflowX === "scroll";
}

function startsSwipe(target: EventTarget | null, open: boolean): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest(OWN_GESTURE)) return false;
  // While the drawer is shut, a dialog on top of the page keeps its own gestures.
  if (!open && target.closest("[role='dialog'], [role='alertdialog']")) return false;
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    if (scrollsHorizontally(el)) return false;
  }
  return true;
}

/**
 * Opens a left-hand drawer on a rightward touch swipe anywhere on the page, and
 * closes it on a leftward one — no need to find the edge or the menu button.
 * Listeners are passive and never call preventDefault, so scrolling is untouched;
 * the gesture is only claimed once the finger has lifted.
 */
export function useSwipeDrawer({ open, onOpenChange, enabled = true }: { open: boolean; onOpenChange: (open: boolean) => void; enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let from: { x: number; y: number; at: number; swipeable: boolean } | null = null;

    const onStart = (e: TouchEvent) => {
      // Ignore pinches and any follow-up finger.
      if (e.touches.length !== 1) {
        from = null;
        return;
      }
      const t = e.touches[0]!;
      from = { x: t.clientX, y: t.clientY, at: Date.now(), swipeable: startsSwipe(e.target, open) };
    };
    const onEnd = (e: TouchEvent) => {
      const start = from;
      from = null;
      if (!start?.swipeable || e.touches.length > 0) return;
      const t = e.changedTouches[0];
      if (!t || Date.now() - start.at > MAX_MS) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < THRESHOLD || Math.abs(dy) > Math.abs(dx) * OFF_AXIS) return;
      const wantsOpen = dx > 0;
      if (wantsOpen !== open) onOpenChange(wantsOpen);
    };
    const onCancel = () => {
      from = null;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled, open, onOpenChange]);
}
