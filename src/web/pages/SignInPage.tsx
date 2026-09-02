import { LogInIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signInUrl, useAuthInfo } from "@/lib/queries/auth";

export function SignInPage({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  const info = useAuthInfo();
  const params = new URLSearchParams(window.location.search);
  const authError = error ?? params.get("auth_error");
  // Land back where the user was, minus any stale error parameter.
  params.delete("auth_error");
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-mono text-xl">opsec▮</CardTitle>
          <CardDescription>Sign in to see your people.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {authError && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {authError}
            </p>
          )}
          <Button size="lg" className="w-full" asChild>
            <a href={signInUrl(next)}>
              <LogInIcon /> Sign in with {info.data?.providerLabel ?? "SSO"}
            </a>
          </Button>
          {onRetry && (
            <Button variant="ghost" onClick={onRetry}>
              Try again
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
