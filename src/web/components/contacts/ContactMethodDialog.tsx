import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CONTACT_METHOD_TYPES } from "@shared/schemas/common";
import { contactMethodInputSchema, type ContactMethodInput } from "@shared/schemas/contact";
import { SOCIAL_BY_KEY, SOCIAL_PLATFORMS, detectSocial, normalizeSocial } from "@shared/social";
import type { ContactMethodOut } from "@shared/types";
import { FieldError } from "@/components/FieldError";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { capitalize } from "@/lib/format";
import { useAddMethod, useUpdateMethod } from "@/lib/queries/methods";
import { SocialIcon } from "./SocialIcon";

const formSchema = z.preprocess((v) => {
  const o = { ...(v as Record<string, unknown>) };
  if (o.label === "") o.label = null;
  return o;
}, contactMethodInputSchema);

type FormValues = { type: (typeof CONTACT_METHOD_TYPES)[number]; label: string; value: string; isPrimary: boolean; sortOrder: number };

const LABEL_HINTS: Record<string, string> = {
  phone: "mobile, home, work",
  email: "personal, work",
  address: "home, office",
  url: "website, blog",
  other: "",
};

export function ContactMethodDialog({
  contactId,
  method,
  initialType = "phone",
  open,
  onOpenChange,
}: {
  contactId: string;
  method?: ContactMethodOut;
  /** Type preselected when adding (e.g. "social" from the Social card). */
  initialType?: (typeof CONTACT_METHOD_TYPES)[number];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const add = useAddMethod(contactId);
  const update = useUpdateMethod(contactId);
  const { register, control, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues, unknown, ContactMethodInput>({
    resolver: zodResolver(formSchema as never),
    defaultValues: { type: "phone", label: "", value: "", isPrimary: false, sortOrder: 0 },
  });
  const type = watch("type");
  const label = watch("label");
  const value = watch("value");

  useEffect(() => {
    if (open)
      reset({
        type: method?.type ?? initialType,
        label: method?.label ?? "",
        value: method?.value ?? "",
        isPrimary: method?.isPrimary ?? false,
        sortOrder: method?.sortOrder ?? 0,
      });
  }, [open, method, initialType, reset]);

  // Social: a pasted profile URL picks the platform automatically.
  const detected = type === "social" ? detectSocial(value) : null;
  useEffect(() => {
    if (type === "social" && detected && (!label || !SOCIAL_BY_KEY.has(label))) setValue("label", detected.platform.key);
  }, [type, detected, label, setValue]);

  const platform = type === "social" ? SOCIAL_BY_KEY.get(label) : undefined;
  const preview = type === "social" && value.trim() ? normalizeSocial(label || null, value) : null;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const input = values.type === "social" ? { ...values, ...(({ platformKey, value }) => ({ label: platformKey, value }))(normalizeSocial(values.label, values.value)) } : values;
      if (method) await update.mutateAsync({ methodId: method.id, input });
      else await add.mutateAsync(input);
      toast.success(method ? "Contact method updated" : "Contact method added");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{method ? "Edit contact method" : "Add contact method"}</DialogTitle>
            <DialogDescription className="sr-only">Phone, email, address, website or social profile.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_METHOD_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {capitalize(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {type === "social" ? (
                <>
                  <Label>Platform</Label>
                  <Controller
                    control={control}
                    name="label"
                    render={({ field }) => (
                      <Select value={SOCIAL_BY_KEY.has(field.value) ? field.value : ""} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose or paste a URL" />
                        </SelectTrigger>
                        <SelectContent>
                          {SOCIAL_PLATFORMS.map((p) => (
                            <SelectItem key={p.key} value={p.key}>
                              <span className="flex items-center gap-2">
                                <SocialIcon platformKey={p.key} className="size-3.5" brand />
                                {p.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </>
              ) : (
                <>
                  <Label htmlFor="m-label">Label</Label>
                  <Input id="m-label" placeholder={LABEL_HINTS[type] ?? ""} {...register("label")} />
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-value">{type === "address" ? "Address" : type === "social" ? "Profile URL or handle" : "Value"}</Label>
            {type === "address" ? (
              <Textarea id="m-value" rows={3} {...register("value")} aria-invalid={!!formState.errors.value} />
            ) : (
              <Input
                id="m-value"
                autoFocus
                placeholder={type === "social" ? (platform?.placeholder ?? "Paste a profile URL") : undefined}
                {...register("value")}
                aria-invalid={!!formState.errors.value}
              />
            )}
            <FieldError message={formState.errors.value?.message} />
            {preview && preview.platformKey !== "website" && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <SocialIcon platformKey={preview.platformKey} className="size-3.5" brand />
                {SOCIAL_BY_KEY.get(preview.platformKey)?.name}: {preview.value}
              </p>
            )}
          </div>
          {type !== "social" && (
            <Controller
              control={control}
              name="isPrimary"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  Primary {type}
                </label>
              )}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending || update.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
