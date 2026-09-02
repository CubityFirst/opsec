import { CheckCircle2Icon, FlaskConicalIcon, SaveIcon, SparklesIcon, Undo2Icon, XCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AI_PRESETS, type AiProviderView, type AiSettingsInput, type AiTestResult } from "@shared/schemas/ai-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { useAiSettings, useResetAiSettings, useSaveAiSettings, useTestAiSettings } from "@/lib/queries/ai-settings";

interface FormState {
  baseUrl: string;
  model: string;
  label: string;
  extraBody: string;
  /** Secrets start blank: blank means "keep what is stored". */
  apiKey: string;
  extraHeaders: string;
}

function fromView(v: AiProviderView): FormState {
  return { baseUrl: v.baseUrl, model: v.model, label: v.label, extraBody: v.extraBody, apiKey: "", extraHeaders: "" };
}

function guessPreset(baseUrl: string): string {
  if (baseUrl.includes("gateway.ai.cloudflare.com")) return "cloudflare-gateway";
  if (baseUrl.startsWith("https://api.openai.com")) return "openai";
  if (baseUrl.startsWith("https://api.anthropic.com")) return "anthropic";
  if (baseUrl.includes("openrouter.ai")) return "openrouter";
  if (/localhost|127\.0\.0\.1|:8080/.test(baseUrl)) return "llama-cpp";
  return "custom";
}

/** Admin-only editor for the Ask model provider; overrides the deployment's AI_* vars on the fly. */
export function AiProviderCard() {
  const settings = useAiSettings();
  const save = useSaveAiSettings();
  const reset = useResetAiSettings();
  const test = useTestAiSettings();
  const [form, setForm] = useState<FormState | null>(null);
  const [preset, setPreset] = useState("custom");
  const [clearKey, setClearKey] = useState(false);
  const [clearHeaders, setClearHeaders] = useState(false);
  const [result, setResult] = useState<AiTestResult | null>(null);

  const data = settings.data;
  useEffect(() => {
    if (data && !form) {
      setForm(fromView(data.active));
      setPreset(guessPreset(data.active.baseUrl));
    }
  }, [data, form]);

  if (settings.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ask provider</CardTitle>
          <CardDescription>{errorMessage(settings.error)}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (!data || !form) return null;

  const active = data.active;
  const presetInfo = AI_PRESETS.find((p) => p.id === preset);
  const busy = save.isPending || reset.isPending || test.isPending;
  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const applyPreset = (id: string) => {
    setPreset(id);
    const p = AI_PRESETS.find((x) => x.id === id);
    if (!p) return;
    let baseUrl = p.baseUrl;
    if (id === "cloudflare-gateway" && data.env.baseUrl.includes("gateway.ai.cloudflare.com")) baseUrl = data.env.baseUrl;
    set({ baseUrl: baseUrl || form.baseUrl, model: p.model || form.model, label: p.label, extraBody: p.extraBody, extraHeaders: p.extraHeaders, apiKey: "" });
    setResult(null);
  };

  const payload = (): AiSettingsInput => ({
    baseUrl: form.baseUrl.trim(),
    model: form.model.trim(),
    label: form.label.trim(),
    extraBody: form.extraBody.trim(),
    apiKey: form.apiKey ? form.apiKey : clearKey ? "" : undefined,
    extraHeaders: form.extraHeaders.trim() ? form.extraHeaders.trim() : clearHeaders ? "" : undefined,
  });

  const afterChange = (out: { active: AiProviderView }) => {
    setForm(fromView(out.active));
    setPreset(guessPreset(out.active.baseUrl));
    setClearKey(false);
    setClearHeaders(false);
    setResult(null);
  };

  const onTest = () => {
    setResult(null);
    test.mutate(payload(), { onSuccess: setResult, onError: (e) => toast.error(errorMessage(e)) });
  };
  const onSave = () =>
    save.mutate(payload(), {
      onSuccess: (out) => {
        afterChange(out);
        toast.success("Provider settings saved. Ask uses them from the next question.");
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  const onReset = () =>
    reset.mutate(undefined, {
      onSuccess: (out) => {
        afterChange(out);
        toast.success("Using the deployment's provider settings again");
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-4" /> Ask provider
          <Badge variant={data.source === "db" ? "default" : "secondary"} className="ml-auto">
            {data.source === "db" ? "saved in app" : "from deployment"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Any OpenAI-compatible chat-completions endpoint. Settings saved here override the Worker's AI_* vars and secrets immediately; secrets are stored
          encrypted and never shown again. Changing the base URL to another host clears the stored key and headers, so enter them again.
          {data.secretsUnreadable && " The stored key and headers could not be decrypted (SESSION_SECRET changed?): enter them again."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="ai-preset">Preset</Label>
          <Select value={preset} onValueChange={applyPreset}>
            <SelectTrigger id="ai-preset" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {presetInfo?.notes && <p className="text-xs text-muted-foreground">{presetInfo.notes}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ai-base-url">Base URL</Label>
          <Input id="ai-base-url" value={form.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder="https://host/v1" spellCheck={false} />
          <p className="text-xs text-muted-foreground">Requests go to {"{base}"}/chat/completions.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ai-model">Model</Label>
            <Input id="ai-model" value={form.model} onChange={(e) => set({ model: e.target.value })} placeholder="model name as the provider expects it" spellCheck={false} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ai-label">Label</Label>
            <Input id="ai-label" value={form.label} onChange={(e) => set({ label: e.target.value })} placeholder="shown in the Ask header" />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ai-api-key">API key</Label>
          <Input
            id="ai-api-key"
            type="password"
            autoComplete="off"
            value={form.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
            placeholder={active.apiKeySet && !clearKey ? "Stored. Leave blank to keep it." : (presetInfo?.apiKeyHint ?? "Provider API key")}
          />
          {active.apiKeySet && !form.apiKey && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={clearKey} onChange={(e) => setClearKey(e.target.checked)} /> Clear the stored key (use “none” for BYOK gateways and
              local servers)
            </label>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ai-extra-headers">Extra headers (JSON object)</Label>
          <Textarea
            id="ai-extra-headers"
            rows={2}
            value={form.extraHeaders}
            onChange={(e) => set({ extraHeaders: e.target.value })}
            placeholder={
              active.extraHeaderNames.length && !clearHeaders
                ? `Stored: ${active.extraHeaderNames.join(", ")}. Leave blank to keep them.`
                : '{"cf-aig-authorization":"Bearer …"}'
            }
            spellCheck={false}
            className="font-mono text-xs"
          />
          {active.extraHeaderNames.length > 0 && !form.extraHeaders.trim() && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={clearHeaders} onChange={(e) => setClearHeaders(e.target.checked)} /> Clear the stored headers
            </label>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ai-extra-body">Extra request fields (JSON object)</Label>
          <Textarea
            id="ai-extra-body"
            rows={2}
            value={form.extraBody}
            onChange={(e) => set({ extraBody: e.target.value })}
            placeholder='{"reasoning_effort":"none"}'
            spellCheck={false}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">Merged into every request: reasoning settings, parallel_tool_calls, provider-specific options.</p>
        </div>

        {result && (
          <div
            className={
              result.ok
                ? "flex items-start gap-2 rounded-md border border-green-600/30 bg-green-600/10 p-3 text-sm"
                : "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm"
            }
          >
            {result.ok ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-green-600" /> : <XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />}
            <div className="min-w-0">
              {result.ok ? (
                <>
                  <span className="font-medium">Connected</span> to {result.model} in {result.ms} ms.{result.reply ? ` Reply: “${result.reply}”` : ""}
                </>
              ) : (
                <>
                  <span className="font-medium">{result.code}</span>: {result.message}
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={onTest} disabled={busy || !form.baseUrl.trim() || !form.model.trim()}>
            <FlaskConicalIcon /> Test
          </Button>
          <Button type="button" onClick={onSave} disabled={busy || !form.baseUrl.trim() || !form.model.trim()}>
            <SaveIcon /> Save
          </Button>
          <span className="flex-1" />
          {data.source === "db" && (
            <Button type="button" variant="ghost" onClick={onReset} disabled={busy}>
              <Undo2Icon /> Use deployment settings
            </Button>
          )}
        </div>
        {data.source === "db" && data.updatedAt && <p className="text-xs text-muted-foreground">Saved {new Date(data.updatedAt).toLocaleString()}.</p>}
      </CardContent>
    </Card>
  );
}
