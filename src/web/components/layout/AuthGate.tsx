import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { UNAUTHORIZED_EVENT, errorMessage } from "@/lib/api";
import { authKeys, useMe } from "@/lib/queries/auth";
import { SignInPage } from "@/pages/SignInPage";

/** Renders children only for a signed-in user; otherwise the sign-in page. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const qc = useQueryClient();

  // Any API call that comes back 401 (expired cookie, revoked session) drops
  // us straight to the sign-in page instead of leaving broken screens behind.
  useEffect(() => {
    const onUnauthorized = () => qc.setQueryData(authKeys.me, null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [qc]);

  if (me.isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }
  if (me.isError) return <SignInPage error={errorMessage(me.error)} onRetry={() => void me.refetch()} />;
  if (!me.data) return <SignInPage />;
  return <>{children}</>;
}
