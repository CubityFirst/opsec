import { useEffect } from "react";
import { brandTitle } from "@shared/schemas/branding";
import { useBranding } from "@/lib/queries/branding";

/**
 * Keeps the browser tab on the instance's own title. index.html ships the stock
 * one so a cold load has something to show before the branding arrives.
 */
export function DocumentTitle() {
  const title = brandTitle(useBranding());
  useEffect(() => {
    document.title = title;
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", title);
  }, [title]);
  return null;
}
