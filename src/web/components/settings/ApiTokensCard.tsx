import { CopyIcon, KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { API_TOKEN_SCOPES, type ApiTokenCreated, type ApiTokenScope } from "@shared/schemas/token";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { useCreateToken, useRevokeToken, useTokens } from "@/lib/queries/tokens";

const SCOPE_LABELS: Record<ApiTokenScope, string> = { read: "Read only", write: "Read and write" };

/** Personal API tokens for MCP clients and scripts. The token itself is shown once. */
export function ApiTokensCard() {
  const tokens = useTokens();
  const create = useCreateToken();
  const revoke = useRevokeToken();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiTokenScope>("read");
  const [created, setCreated] = useState<ApiTokenCreated | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const mcpUrl = `${window.location.origin}/mcp`;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Could not copy; select the text instead");
    }
  };

  const onCreate = () =>
    create.mutate(
      { name: name.trim(), scope },
      {
        onSuccess: (t) => {
          setCreated(t);
          setName("");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRoundIcon className="size-4" /> API tokens
        </CardTitle>
        <CardDescription>For MCP clients (Claude Code, Claude Desktop, ChatGPT) and scripts.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {created && (
          <div className="flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
            <p className="font-medium">Token “{created.name}” created. Copy it now; it will not be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">{created.token}</code>
              <Button type="button" size="sm" variant="outline" onClick={() => void copy(created.token, "Token")}>
                <CopyIcon /> Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Add it to Claude Code with:</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">
                claude mcp add opsec --transport http {mcpUrl} --header "Authorization: Bearer {created.token}"
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copy(`claude mcp add opsec --transport http ${mcpUrl} --header "Authorization: Bearer ${created.token}"`, "Command")}
              >
                <CopyIcon /> Copy
              </Button>
            </div>
            <div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreated(null)}>
                Done
              </Button>
            </div>
          </div>
        )}

        {tokens.data && tokens.data.length > 0 && (
          <ul className="flex flex-col divide-y rounded-md border text-sm">
            {tokens.data.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 hidden size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground sm:flex" aria-hidden>
                    <KeyRoundIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{t.name}</span>
                      <Badge variant="outline" className="shrink-0 text-muted-foreground">
                        {SCOPE_LABELS[t.scope]}
                      </Badge>
                    </div>
                    <div className="meta-dots flex flex-wrap text-xs text-muted-foreground">
                      <code className="font-mono">{t.prefix}…</code>
                      <span className="whitespace-nowrap">Created {formatRelative(t.createdAt)}</span>
                      <span className="whitespace-nowrap">{t.lastUsedAt ? `last used ${formatRelative(t.lastUsedAt)}` : "never used"}</span>
                    </div>
                  </div>
                  {confirming !== t.id && (
                    <Button type="button" size="icon-sm" variant="ghost" className="-mr-1 shrink-0 text-muted-foreground" aria-label={`Revoke ${t.name}`} title="Revoke" onClick={() => setConfirming(t.id)}>
                      <Trash2Icon />
                    </Button>
                  )}
                </div>
                {confirming === t.id && (
                  <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-2.5 sm:ml-11 sm:flex-row sm:items-center">
                    <p className="flex-1 text-xs text-muted-foreground">Revoke this token? Anything using it stops working at once.</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={revoke.isPending}
                        onClick={() =>
                          revoke.mutate(t.id, {
                            onSuccess: () => {
                              setConfirming(null);
                              toast.success("Token revoked");
                            },
                            onError: (e) => toast.error(errorMessage(e)),
                          })
                        }
                      >
                        Revoke token
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {tokens.data && tokens.data.length === 0 && !created && <p className="text-sm text-muted-foreground">No tokens yet.</p>}

        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end sm:gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onCreate();
          }}
        >
          <div className="grid content-start gap-1.5">
            <Label htmlFor="token-name">Name</Label>
            <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Claude on laptop" maxLength={60} />
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="token-scope">Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ApiTokenScope)}>
              <SelectTrigger id="token-scope" className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {API_TOKEN_SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SCOPE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            <PlusIcon /> Create token
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          MCP endpoint: <code className="font-mono">{mcpUrl}</code>. The same token also works for the JSON API with an Authorization: Bearer header.
        </p>
      </CardContent>
    </Card>
  );
}
