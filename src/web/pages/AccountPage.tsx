import { EyeOffIcon, LogOutIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { AiProviderCard } from "@/components/settings/AiProviderCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api";
import { useAuthUser, useLogout, useUpdatePreferences } from "@/lib/queries/auth";

export function AccountPage() {
  const user = useAuthUser();
  const logout = useLogout();
  const updatePrefs = useUpdatePreferences();
  if (!user) return null;

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
        <p className="text-sm text-muted-foreground">Signed in with Annex. These claims come from the verified id_token.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheckIcon className="size-4 text-muted-foreground" /> Verified claims
          </CardTitle>
          <CardDescription>
            {user.isAdmin ? "You have the admin role: destructive actions such as permanent deletes are enabled." : "Standard access. Permanent deletes need the admin role."}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <EyeOffIcon className="size-4 text-muted-foreground" /> Dashboard
          </CardTitle>
          <CardDescription>Preferences are saved to your account and follow you between devices.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="pref-dashboard-details">Show contact details on the dashboard</Label>
              <p className="text-xs text-muted-foreground">
                When off, the dashboard hides who each interaction was with and shows birthday and out-of-touch counts instead of names. Handy when sharing your screen.
              </p>
            </div>
            <Switch
              id="pref-dashboard-details"
              checked={user.preferences.dashboardShowContactDetails}
              disabled={updatePrefs.isPending}
              onCheckedChange={(checked) =>
                updatePrefs.mutate({ dashboardShowContactDetails: checked }, { onError: (e) => toast.error(errorMessage(e)) })
              }
            />
          </div>
        </CardContent>
      </Card>

      {user.isAdmin && <AiProviderCard />}

      <div>
        <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOutIcon /> Sign out
        </Button>
      </div>
    </div>
  );
}
