/**
 * Pixel position of a caret index inside a textarea, measured with a hidden
 * mirror element that copies the textarea's typography and box metrics.
 * Coordinates are relative to the textarea's border box and already account
 * for its scroll offset.
 */
const MIRROR_PROPS = [
  "direction",
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
] as const;

export interface CaretCoordinates {
  top: number;
  left: number;
  /** Line height at the caret, so a popup can sit just below the line. */
  height: number;
}

export function caretCoordinates(el: HTMLTextAreaElement, position: number): CaretCoordinates {
  const computed = getComputedStyle(el);
  const mirror = document.createElement("div");
  const style = mirror.style;
  for (const prop of MIRROR_PROPS) style[prop] = computed[prop];
  style.position = "absolute";
  style.visibility = "hidden";
  style.top = "0";
  style.left = "-9999px";
  style.whiteSpace = "pre-wrap";
  style.overflowWrap = "break-word";
  style.overflow = "hidden";
  mirror.textContent = el.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = el.value.slice(position) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;
  const coords = {
    top: marker.offsetTop + (parseFloat(computed.borderTopWidth) || 0) - el.scrollTop,
    left: marker.offsetLeft + (parseFloat(computed.borderLeftWidth) || 0) - el.scrollLeft,
    height: lineHeight,
  };
  mirror.remove();
  return coords;
}
