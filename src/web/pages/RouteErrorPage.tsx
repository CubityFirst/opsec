import { AlertTriangleIcon, HomeIcon, RefreshCwIcon } from "lucide-react";
import { useEffect } from "react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** True for the "error loading dynamically imported module" family of failures. */
export function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /dynamically imported module|Loading chunk|Importing a module script failed|Failed to fetch dynamically imported module/i.test(message);
}

const RELOAD_KEY = "opsec:chunk-reload";

/**
 * Route-level error boundary. A stale tab asking for a chunk that a newer
 * deploy replaced is reloaded once automatically; anything else gets a
 * readable page with the details and a way back.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const stale = isChunkLoadError(error);

  useEffect(() => {
    if (!stale) return;
    let reloaded = false;
    try {
      reloaded = sessionStorage.getItem(RELOAD_KEY) === window.location.href;
      if (!reloaded) sessionStorage.setItem(RELOAD_KEY, window.location.href);
    } catch {
      /* storage unavailable: fall through to the manual button */
    }
    if (!reloaded) window.location.reload();
  }, [stale]);

  const status = isRouteErrorResponse(error) ? error.status : null;
  const title = stale ? "A new version of opsec▮ is available" : status === 404 ? "Page not found" : "Something went wrong";
  const description = stale
    ? "The page you had open belongs to an older build. Reloading picks up the latest one."
    : status === 404
      ? "That page does not exist."
      : "The page hit an error it could not recover from.";
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : String(error ?? "");

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="size-5 text-muted-foreground" /> {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!stale && detail && <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{detail}</pre>}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                try {
                  sessionStorage.removeItem(RELOAD_KEY);
                } catch {
                  /* ignore */
                }
                window.location.reload();
              }}
            >
              <RefreshCwIcon /> Reload
            </Button>
            <Button variant="outline" asChild>
              <Link to="/" reloadDocument>
                <HomeIcon /> Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
