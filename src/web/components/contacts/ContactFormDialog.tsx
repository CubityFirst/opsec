import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CONTACT_KINDS, CONTACT_METHOD_TYPES } from "@shared/schemas/common";
import { contactCreateSchema, contactUpdateSchema, type ContactCreateInput, type ContactUpdateInput } from "@shared/schemas/contact";
import type { ContactDetail, ContactRef } from "@shared/types";
import { FieldError } from "@/components/FieldError";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { KIND_LABELS, capitalize } from "@/lib/format";
import { useCreateContact, useUpdateContact } from "@/lib/queries/contacts";
import { BirthdayInput } from "./BirthdayInput";
import { ContactPicker } from "./ContactPicker";
import { TagNamesInput } from "./TagNamesInput";

/** Empty strings from inputs become null/undefined so the shared schema accepts them. */
function normalise(v: unknown) {
  if (!v || typeof v !== "object") return v;
  const o = { ...(v as Record<string, unknown>) };
  for (const k of ["lastName", "nickname", "pronouns", "notes", "birthday", "metOn", "metWhere", "metHow", "jobTitle"]) {
    if (o[k] === "") o[k] = null;
  }
  // The form holds the picked contact; the API wants its id.
  const via = o.metVia as { id?: string } | null | undefined;
  o.metViaContactId = via?.id ?? null;
  delete o.metVia;
  const employer = o.employer as { id?: string } | null | undefined;
  o.employerContactId = employer?.id ?? null;
  delete o.employer;
  if (Array.isArray(o.methods)) {
    o.methods = o.methods.map((m) => (m && typeof m === "object" ? { ...m, label: (m as { label?: string }).label || null } : m));
  }
  return o;
}

const createFormSchema = z.preprocess(normalise, contactCreateSchema);
const updateFormSchema = z.preprocess(normalise, contactUpdateSchema);

type FormValues = {
  kind: (typeof CONTACT_KINDS)[number];
  firstName: string;
  lastName: string;
  nickname: string;
  pronouns: string;
  birthday: string;
  notes: string;
  methods: { type: (typeof CONTACT_METHOD_TYPES)[number]; label: string; value: string; isPrimary: boolean; sortOrder: number }[];
  otherNames: { label: string; value: string }[];
  metOn: string;
  metWhere: string;
  metHow: string;
  metVia: ContactRef | null;
  jobTitle: string;
  employer: ContactRef | null;
  tagNames: string[];
};

function defaults(contact?: ContactDetail): FormValues {
  return {
    kind: contact?.kind ?? "person",
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    nickname: contact?.nickname ?? "",
    pronouns: contact?.pronouns ?? "",
    otherNames: contact?.otherNames ?? [],
    metOn: contact?.metOn ?? "",
    metWhere: contact?.metWhere ?? "",
    metHow: contact?.metHow ?? "",
    metVia: contact?.metVia ?? null,
    jobTitle: contact?.jobTitle ?? "",
    employer: contact?.employer ?? null,
    birthday: contact?.birthday ?? "",
    notes: contact?.notes ?? "",
    methods: [],
    tagNames: [],
  };
}

export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided the dialog edits this contact; otherwise it creates. */
  contact?: ContactDetail;
  onCreated?: (contact: ContactDetail) => void;
}) {
  const isEdit = !!contact;
  const create = useCreateContact();
  const update = useUpdateContact(contact?.id ?? "");

  const form = useForm<FormValues, unknown, ContactCreateInput | ContactUpdateInput>({
    resolver: zodResolver((isEdit ? updateFormSchema : createFormSchema) as never),
    defaultValues: defaults(contact),
  });
  const { register, control, handleSubmit, reset, watch, formState } = form;
  const methods = useFieldArray({ control, name: "methods" });
  const otherNames = useFieldArray({ control, name: "otherNames" });
  const kind = watch("kind");
  const isPerson = kind === "person";

  useEffect(() => {
    if (open) reset(defaults(contact));
  }, [open, contact, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await update.mutateAsync(values as ContactUpdateInput);
        toast.success("Contact updated");
      } else {
        const created = await create.mutateAsync(values as ContactCreateInput);
        toast.success(`Added ${created.displayName}`);
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  const nameLabel = kind === "person" ? "First name" : "Name";
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{isEdit ? `Edit ${contact.displayName}` : "New contact"}</DialogTitle>
            <DialogDescription>{isEdit ? "Update the basics. Methods and tags are edited on the profile." : "People, pets, and organisations all live here."}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kind">Kind</Label>
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="kind" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nickname">Nickname</Label>
              <Input id="nickname" {...register("nickname")} />
            </div>
            {isPerson && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pronouns">Pronouns</Label>
                <Input id="pronouns" placeholder="e.g. she/her, they/them" {...register("pronouns")} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">{nameLabel}</Label>
              <Input id="firstName" autoFocus {...register("firstName")} aria-invalid={!!formState.errors.firstName} />
              <FieldError message={formState.errors.firstName?.message} />
            </div>
            {kind === "person" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" {...register("lastName")} />
              </div>
            )}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Other names</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => otherNames.append({ label: "", value: "" })}>
                  <PlusIcon /> Add name
                </Button>
              </div>
              {otherNames.fields.length === 0 && (
                <p className="text-xs text-muted-foreground">{kind === "organization" ? "Trading names, former names, abbreviations." : "e.g. a Chinese name, an English name, a maiden name."}</p>
              )}
              {otherNames.fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2">
                  <div className="flex flex-col gap-1">
                    <Input placeholder="Label (e.g. Chinese name)" {...register(`otherNames.${i}.label`)} aria-invalid={!!formState.errors.otherNames?.[i]?.label} />
                    <FieldError message={formState.errors.otherNames?.[i]?.label?.message} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Input placeholder="Name" {...register(`otherNames.${i}.value`)} aria-invalid={!!formState.errors.otherNames?.[i]?.value} />
                    <FieldError message={formState.errors.otherNames?.[i]?.value?.message} />
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove name" onClick={() => otherNames.remove(i)}>
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="birthday">{kind === "organization" ? "Founded" : "Birthday"}</Label>
              <Controller
                control={control}
                name="birthday"
                render={({ field }) => <BirthdayInput id="birthday" value={field.value} onChange={field.onChange} invalid={!!formState.errors.birthday} />}
              />
              <p className="text-xs text-muted-foreground">Fill in whichever parts you know. A day needs a month.</p>
              <FieldError message={formState.errors.birthday?.message} />
            </div>
          </div>

          {kind === "person" && (
            <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">Work</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="jobTitle">Job title</Label>
                  <Input id="jobTitle" placeholder="e.g. Audit Manager" {...register("jobTitle")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Place of work</Label>
                  <Controller
                    control={control}
                    name="employer"
                    render={({ field }) => (
                      <div className="flex items-center gap-1">
                        <ContactPicker value={field.value} onSelect={field.onChange} kinds={["organization"]} placeholder="Pick an organisation" className="min-w-0 flex-1" />
                        {field.value && (
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear" onClick={() => field.onChange(null)}>
                            <Trash2Icon />
                          </Button>
                        )}
                      </div>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">Adds the employer relationship for you. The organisation must already be a contact.</p>
                </div>
              </div>
            </fieldset>
          )}

          <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">How we met</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="metOn">When</Label>
                <Controller
                  control={control}
                  name="metOn"
                  render={({ field }) => <BirthdayInput id="metOn" value={field.value} onChange={field.onChange} invalid={!!formState.errors.metOn} />}
                />
                <FieldError message={formState.errors.metOn?.message} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="metWhere">Where</Label>
                <Input id="metWhere" placeholder="e.g. climbing gym, Bristol" {...register("metWhere")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Introduced by / known through</Label>
                <Controller
                  control={control}
                  name="metVia"
                  render={({ field }) => (
                    <div className="flex items-center gap-1">
                      <ContactPicker value={field.value} onSelect={field.onChange} excludeIds={contact ? [contact.id] : []} placeholder="Pick a contact (optional)" className="min-w-0 flex-1" />
                      {field.value && (
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear" onClick={() => field.onChange(null)}>
                          <Trash2Icon />
                        </Button>
                      )}
                    </div>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="metHow">How</Label>
                <Textarea id="metHow" rows={2} placeholder="e.g. Sat next to each other at Priya's wedding" {...register("metHow")} />
              </div>
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={4} placeholder="Markdown supported" {...register("notes")} />
          </div>

          {!isEdit && (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>Contact methods</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => methods.append({ type: "phone", label: "", value: "", isPrimary: methods.fields.length === 0, sortOrder: methods.fields.length })}
                  >
                    <PlusIcon /> Add
                  </Button>
                </div>
                {methods.fields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-[7rem_1fr_auto] gap-2 sm:grid-cols-[7rem_7rem_1fr_auto]">
                    <Controller
                      control={control}
                      name={`methods.${i}.type`}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label="Type">
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
                    <Input placeholder="Label" className="hidden sm:block" {...register(`methods.${i}.label`)} />
                    <div className="flex flex-col gap-1">
                      <Input placeholder="Value" {...register(`methods.${i}.value`)} aria-invalid={!!formState.errors.methods?.[i]?.value} />
                      <FieldError message={formState.errors.methods?.[i]?.value?.message} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Controller
                        control={control}
                        name={`methods.${i}.isPrimary`}
                        render={({ field }) => (
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} /> Primary
                          </label>
                        )}
                      />
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => methods.remove(i)}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Tags</Label>
                <Controller control={control} name="tagNames" render={({ field }) => <TagNamesInput value={field.value} onChange={field.onChange} />} />
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
