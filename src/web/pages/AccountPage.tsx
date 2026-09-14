import { ChevronDownIcon, LogOutIcon, ShieldAlertIcon, ShieldCheckIcon, UserRoundIcon } from "lucide-react";
import { useState } from "react";
import { AiProviderCard } from "@/components/settings/AiProviderCard";
import { ApiTokensCard } from "@/components/settings/ApiTokensCard";
import { BrandingCard } from "@/components/settings/BrandingCard";
import { CalendarFeedsCard } from "@/components/settings/CalendarFeedsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccessIdentity } from "@/lib/queries/access";
import { useAuthUser, useLogout } from "@/lib/queries/auth";

export function AccountPage() {
  const user = useAuthUser();
  const logout = useLogout();
  const [signInOpen, setSignInOpen] = useState(false);
  // Open mode is only alarming when nothing guards the hostname, so ask Cloudflare Access first.
  const access = useAccessIdentity(user?.authMode === "open");
  if (!user) return null;
  const open = user.authMode === "open";
  const behindAccess = access.data != null;

  const rows: [string, React.ReactNode][] = [
    ["sub", <code key="sub" className="font-mono text-xs">{user.sub}</code>],
    ["name", user.name ?? <span className="text-muted-foreground">—</span>],
    [
      "email",
      <span key="email">
        {user.email ?? <span className="text-muted-foreground">—</span>}{" "}
        {user.email && (
          <Badge variant={user.emailVerified ? "secondary" : "outline"} className="ml-1 align-middle">
            {user.emailVerified ? "verified" : "unverified"}
          </Badge>
        )}
      </span>,
    ],
    [
      "roles",
      user.roles.length === 0 ? (
        <span className="text-muted-foreground">none</span>
      ) : (
        <span key="roles" className="flex flex-wrap gap-1">
          {user.roles.map((r) => (
            <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>
              {r}
            </Badge>
          ))}
        </span>
      ),
    ],
  ];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">
          {!open
            ? `Signed in with ${user.providerLabel}.`
            : behindAccess
              ? "Open access: no sign-in of its own, gated by Cloudflare Access."
              : "Open access: this instance has no sign-in."}
        </p>
      </div>

      {open && behindAccess && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheckIcon className="size-4 text-muted-foreground" /> Cloudflare Access guards this instance
            </CardTitle>
            <CardDescription>
              AUTH_MODE is “open”, so the app has no sign-in of its own and treats every visitor as the owner — but this hostname sits behind a Cloudflare
              Access application, which let you through as {access.data?.email ?? "an approved visitor"}
              {access.data?.idp && ` (${access.data.idp})`}. Access identities are not mapped onto app users, so everyone your policy admits shares the same owner
              account and its admin rights.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {open && !behindAccess && !access.isLoading && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlertIcon className="size-4 text-amber-600" /> Anyone with the URL can use this instance
            </CardTitle>
            <CardDescription>
              AUTH_MODE is “open”: there is no sign-in and every visitor is treated as the owner. Put your own authentication in front (for example Cloudflare
              Access on the workers.dev hostname) or switch to OpenID Connect by setting AUTH_MODE=oidc with your provider’s issuer, client id, client secret and
              a SESSION_SECRET. See the README → Deploy your own.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left"
            aria-expanded={signInOpen}
            aria-controls="sign-in-details"
            onClick={() => setSignInOpen((o) => !o)}
          >
            <CardTitle className="flex flex-1 items-center gap-2 text-base">
              <UserRoundIcon className="size-4 text-muted-foreground" /> Sign-in details
            </CardTitle>
            <ChevronDownIcon className={`size-4 shrink-0 text-muted-foreground transition-transform ${signInOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          <CardDescription>
            {user.isAdmin ? "You have the admin role: destructive actions such as permanent deletes are enabled." : "Standard access. Permanent deletes need the admin role."}
            {!open && " The details below come from the verified id_token."}
          </CardDescription>
        </CardHeader>
        {signInOpen && (
          <CardContent id="sign-in-details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-all">{v}</dd>
                </div>
              ))}
            </dl>
            <pre className="mt-4 overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(user, null, 2)}</pre>
          </CardContent>
        )}
      </Card>

      <CalendarFeedsCard />

      <ApiTokensCard />

      {user.isAdmin && <AiProviderCard />}

      {user.isAdmin && <BrandingCard />}

      {!open && (
      <div>
        <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOutIcon /> Sign out
        </Button>
      </div>
      )}
    </div>
  );
}
