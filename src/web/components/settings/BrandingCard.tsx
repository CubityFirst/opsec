import { PaletteIcon, SaveIcon, Undo2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { brandShortName, brandTitle, DEFAULT_BRANDING, type Branding, type BrandingOut } from "@shared/schemas/branding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { useBrandingSettings, useResetBranding, useSaveBranding } from "@/lib/queries/branding";

/** Admin-only: what this instance calls itself, everywhere from the sidebar to the installed app. */
export function BrandingCard() {
  const settings = useBrandingSettings();
  const save = useSaveBranding();
  const reset = useResetBranding();
  const [form, setForm] = useState<Branding | null>(null);

  const data = settings.data;
  useEffect(() => {
    if (data && !form) setForm(data.branding);
  }, [data, form]);

  if (settings.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branding</CardTitle>
          <CardDescription>{errorMessage(settings.error)}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (!data || !form) return null;

  const busy = save.isPending || reset.isPending;
  const set = (patch: Partial<Branding>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const preview: Branding = { ...form, name: form.name.trim() || DEFAULT_BRANDING.name };

  const afterChange = (out: BrandingOut) => setForm(out.branding);

  const onSave = () =>
    save.mutate(
      { name: form.name.trim(), shortName: form.shortName.trim(), title: form.title.trim(), tagline: form.tagline.trim() },
      {
        onSuccess: (out) => {
          afterChange(out);
          toast.success("Branding saved");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  const onReset = () =>
    reset.mutate(undefined, {
      onSuccess: (out) => {
        afterChange(out);
        toast.success(`Back to ${DEFAULT_BRANDING.name}`);
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PaletteIcon className="size-4" /> Branding
          <Badge variant={data.source === "db" ? "default" : "secondary"} className="ml-auto">
            {data.source === "db" ? "renamed" : "default"}
          </Badge>
        </CardTitle>
        <CardDescription>
          What this instance calls itself: the sidebar wordmark, the sign-in card, the browser tab and the name the app installs under. It applies to everyone,
          and only the wording changes — the icons come from the files in <code className="font-mono text-xs">public/</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="brand-name">Name</Label>
          <Input id="brand-name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={DEFAULT_BRANDING.name} maxLength={40} />
          <p className="text-xs text-muted-foreground">Shown in the sidebar and wherever the app names itself.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="brand-title">Browser tab title</Label>
            <Input id="brand-title" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder={preview.name} maxLength={80} />
            <p className="text-xs text-muted-foreground">Blank uses the name.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="brand-short-name">Short name</Label>
            <Input
              id="brand-short-name"
              value={form.shortName}
              onChange={(e) => set({ shortName: e.target.value })}
              placeholder={preview.name}
              maxLength={30}
            />
            <p className="text-xs text-muted-foreground">Under the icon on a home screen. Blank uses the name.</p>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="brand-tagline">Sign-in tagline</Label>
          <Input
            id="brand-tagline"
            value={form.tagline}
            onChange={(e) => set({ tagline: e.target.value })}
            placeholder={DEFAULT_BRANDING.tagline}
            maxLength={160}
          />
          <p className="text-xs text-muted-foreground">One line under the name on the sign-in page. Blank hides it.</p>
        </div>

        <div className="rounded-md border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Preview</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-tight">{preview.name}</p>
          {preview.tagline.trim() && <p className="text-sm text-muted-foreground">{preview.tagline}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            Tab: {brandTitle(preview)} · Home screen: {brandShortName(preview)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={onSave} disabled={busy || !form.name.trim()}>
            <SaveIcon /> Save
          </Button>
          <span className="flex-1" />
          {data.source === "db" && (
            <Button type="button" variant="ghost" onClick={onReset} disabled={busy}>
              <Undo2Icon /> Reset to {DEFAULT_BRANDING.name}
            </Button>
          )}
        </div>
        {data.source === "db" && data.updatedAt && <p className="text-xs text-muted-foreground">Saved {new Date(data.updatedAt).toLocaleString()}.</p>}
      </CardContent>
    </Card>
  );
}
