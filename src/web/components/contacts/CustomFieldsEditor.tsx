import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ContactDetail } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { useUpdateContact } from "@/lib/queries/contacts";

type Fields = ContactDetail["customFields"];

function coerce(raw: string): string | number | boolean | null {
  const t = raw.trim();
  if (t === "") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return raw;
}

export function CustomFieldsEditor({ contact }: { contact: ContactDetail }) {
  const update = useUpdateContact(contact.id);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<{ key: string; value: string }[]>([]);

  const start = () => {
    setRows(Object.entries(contact.customFields).map(([key, value]) => ({ key, value: value === null ? "" : String(value) })));
    setEditing(true);
  };

  const save = async () => {
    const next: Fields = {};
    for (const r of rows) {
      const k = r.key.trim();
      if (!k) continue;
      next[k] = coerce(r.value);
    }
    try {
      await update.mutateAsync({ customFields: next });
      toast.success("Custom fields saved");
      setEditing(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const entries = Object.entries(contact.customFields);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Custom fields</CardTitle>
        {editing ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Cancel" onClick={() => setEditing(false)}>
              <XIcon />
            </Button>
            <Button size="icon-sm" aria-label="Save" disabled={update.isPending} onClick={() => void save()}>
              <CheckIcon />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label="Edit custom fields" onClick={start}>
            <PencilIcon />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                <Input placeholder="Field" value={r.key} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                <Input placeholder="Value" value={r.value} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="self-start" onClick={() => setRows([...rows, { key: "", value: "" }])}>
              <PlusIcon /> Add field
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No custom fields. Use these for anything the standard fields miss: shoe size, favourite wine, allergies…</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {entries.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-words">{v === null ? <span className="text-muted-foreground">—</span> : String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
