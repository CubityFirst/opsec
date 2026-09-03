import { MentionText } from "@/components/MentionText";
import { CakeIcon, HandshakeIcon, MessageSquarePlusIcon, PencilIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Link, useOutletContext } from "react-router";
import { toast } from "sonner";
import type { ContactMethodType } from "@shared/schemas/common";
import type { ContactMethodOut } from "@shared/types";
import { ContactMethodDialog } from "@/components/contacts/ContactMethodDialog";
import { CustomFieldsEditor } from "@/components/contacts/CustomFieldsEditor";
import { InteractionDialog } from "@/components/interactions/InteractionDialog";
import { BetCard } from "@/components/bets/BetCard";
import { BetDialog } from "@/components/bets/BetDialog";
import { LifeEventCard } from "@/components/life-events/LifeEventCard";
import { LifeEventDialog } from "@/components/life-events/LifeEventDialog";
import { useContactBets } from "@/lib/queries/bets";
import { useLifeEvents } from "@/lib/queries/life-events";
import { describeRecord } from "../BetsPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage } from "@/lib/api";
import { INTERACTION_LABELS, capitalize, formatDate, formatRelative, formatBirthday } from "@/lib/format";
import { describeSocial } from "@shared/social";
import { SocialIcon } from "@/components/contacts/SocialIcon";
import { useDeleteMethod } from "@/lib/queries/methods";
import type { ContactOutletContext } from "../ContactDetailPage";

function methodHref(m: ContactMethodOut): string | undefined {
  switch (m.type) {
    case "phone":
      return `tel:${m.value}`;
    case "email":
      return `mailto:${m.value}`;
    case "url":
      return /^https?:\/\//i.test(m.value) ? m.value : `https://${m.value}`;
    case "social":
      return /^https?:\/\//i.test(m.value) ? m.value : undefined;
    default:
      return undefined;
  }
}

export function OverviewTab() {
  const { contact, openEdit } = useOutletContext<ContactOutletContext>();
  const [methodDialog, setMethodDialog] = useState<{ open: boolean; method?: ContactMethodOut; initialType?: ContactMethodType }>({ open: false });
  const socials = contact.methods.filter((m) => m.type === "social");
  const details = contact.methods.filter((m) => m.type !== "social");
  const [logOpen, setLogOpen] = useState(false);
  const [lifeOpen, setLifeOpen] = useState(false);
  const [betOpen, setBetOpen] = useState(false);
  const lifeEvents = useLifeEvents(contact.id);
  const bets = useContactBets(contact.id);
  const betItems = bets.data?.items ?? [];
  const openBets = betItems.filter((b) => b.status === "open");
  const settledBets = betItems.filter((b) => b.status === "settled");
  const deleteMethod = useDeleteMethod(contact.id);

  const onDeleteMethod = async (m: ContactMethodOut) => {
    try {
      await deleteMethod.mutateAsync(m.id);
      toast.success("Removed");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const last = contact.lastInteraction;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Phone, email &amp; address</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setMethodDialog({ open: true, initialType: "phone" })}>
              <PlusIcon /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {details.length === 0 ? (
              <p className="text-sm text-muted-foreground">No phone, email, or address yet.</p>
            ) : (
              <ul className="divide-y">
                {details.map((m) => {
                  const href = methodHref(m);
                  return (
                    <li key={m.id} className="flex items-center gap-3 py-2">
                      <div className="w-20 shrink-0 text-xs text-muted-foreground">
                        {capitalize(m.type)}
                        {m.label && <div className="truncate">{m.label}</div>}
                      </div>
                      <div className="min-w-0 flex-1 text-sm whitespace-pre-line">
                        {href ? (
                          <a href={href} target={m.type === "url" ? "_blank" : undefined} rel="noreferrer" className="hover:underline">
                            {m.value}
                          </a>
                        ) : (
                          m.value
                        )}
                      </div>
                      {m.isPrimary && <StarIcon className="size-3.5 fill-amber-400 text-amber-400" aria-label="Primary" />}
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setMethodDialog({ open: true, method: m })}>
                        <PencilIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => void onDeleteMethod(m)}>
                        <Trash2Icon />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Social</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setMethodDialog({ open: true, initialType: "social" })}>
              <PlusIcon /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {socials.length === 0 ? (
              <p className="text-sm text-muted-foreground">No social profiles yet. Paste a profile URL to add one.</p>
            ) : (
              <ul className="divide-y">
                {socials.map((m) => {
                  const s = describeSocial(m.label, m.value);
                  return (
                    <li key={m.id} className="group flex items-center gap-3 py-2">
                      <SocialIcon platformKey={s.platform.key} className="size-5 shrink-0" brand />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted-foreground">{s.platform.name}</div>
                        {s.href ? (
                          <a href={s.href} target="_blank" rel="noreferrer" className="block truncate text-sm hover:underline">
                            {s.handle}
                          </a>
                        ) : (
                          <div className="truncate text-sm">{s.handle}</div>
                        )}
                      </div>
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setMethodDialog({ open: true, method: m })}>
                        <PencilIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => void onDeleteMethod(m)}>
                        <Trash2Icon />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Life events</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setLifeOpen(true)}>
              <PlusIcon /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {lifeEvents.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (lifeEvents.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No life events yet: work &amp; education, family &amp; relationships, home &amp; living, health &amp; wellness, travel &amp; experiences.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {lifeEvents.data!.items.slice(0, 5).map((l) => (
                  <LifeEventCard key={l.id} lifeEvent={l} compact />
                ))}
                {lifeEvents.data!.items.length > 5 && (
                  <p className="text-xs text-muted-foreground">{lifeEvents.data!.items.length - 5} more in the Activity tab.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {contact.kind !== "pet" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                Bets
                {bets.data && betItems.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{describeRecord(bets.data.record)}</span>}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setBetOpen(true)}>
                <PlusIcon /> Make a bet
              </Button>
            </CardHeader>
            <CardContent>
              {bets.isPending ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : betItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bets with {contact.displayName} yet. Write down a prediction, a wager and the day you will know who was right.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {openBets.map((b) => (
                    <BetCard key={b.id} bet={b} compact />
                  ))}
                  {settledBets.slice(0, 3).map((b) => (
                    <BetCard key={b.id} bet={b} compact />
                  ))}
                  {settledBets.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      {settledBets.length - 3} more settled{" "}
                      <Link to="/bets?status=settled" className="underline">
                        on the Bets page
                      </Link>
                      .
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {contact.notes ? (
              <MarkdownBody className="prose prose-sm max-w-none text-foreground dark:prose-invert [&_h1]:text-lg [&_h2]:text-base [&_p]:mb-2">{contact.notes}</MarkdownBody>
            ) : (
              <p className="text-sm text-muted-foreground">No notes. Use Edit to add some (markdown works).</p>
            )}
          </CardContent>
        </Card>

        <CustomFieldsEditor contact={contact} />
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Last spoke</CardTitle>
            <Button size="sm" onClick={() => setLogOpen(true)}>
              <MessageSquarePlusIcon /> Log interaction
            </Button>
          </CardHeader>
          <CardContent>
            {last ? (
              <div className="flex flex-col gap-1">
                <div className="text-lg font-medium">{formatRelative(last.occurredAt)}</div>
                <div className="text-xs text-muted-foreground">
                  {INTERACTION_LABELS[last.type]} · {formatDate(last.occurredAt)}
                </div>
                <p className="mt-1 text-sm">
                  <MentionText text={last.summary} />
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No interactions logged yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="flex items-center gap-1 text-muted-foreground">
                <CakeIcon className="size-3.5" /> {contact.kind === "organization" ? "Founded" : "Birthday"}
              </dt>
              <dd>{contact.birthday ? formatBirthday(contact.birthday) : <span className="text-muted-foreground">—</span>}</dd>
              <dt className="flex items-center gap-1 text-muted-foreground">
                <HandshakeIcon className="size-3.5" /> Met
              </dt>
              <dd>
                {contact.metOn || contact.metWhere || contact.metHow || contact.metVia ? (
                  <button type="button" onClick={openEdit} className="group flex flex-col items-start gap-0.5 text-left" title="Edit how you met">
                    <span className="group-hover:underline">
                      {[contact.metOn && formatBirthday(contact.metOn).split(" (")[0], contact.metWhere && `at ${contact.metWhere}`].filter(Boolean).join(" ") || "—"}
                    </span>
                    {contact.metHow && <span className="text-muted-foreground">{contact.metHow}</span>}
                  </button>
                ) : (
                  <button type="button" onClick={openEdit} className="text-muted-foreground hover:text-foreground hover:underline">
                    Add how you met…
                  </button>
                )}
                {contact.metVia && (
                  <div className="text-muted-foreground">
                    Through{" "}
                    <Link to={`/contacts/${contact.metVia.id}`} className="font-medium text-foreground hover:underline">
                      {contact.metVia.displayName}
                    </Link>
                  </div>
                )}
              </dd>
              <dt className="text-muted-foreground">Added</dt>
              <dd>{formatDate(contact.createdAt)}</dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>{formatRelative(contact.updatedAt)}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <ContactMethodDialog
        contactId={contact.id}
        method={methodDialog.method}
        initialType={methodDialog.initialType}
        open={methodDialog.open}
        onOpenChange={(o) => setMethodDialog((s) => ({ ...s, open: o }))}
      />
      <InteractionDialog open={logOpen} onOpenChange={setLogOpen} initialParticipants={[contact]} />
      <LifeEventDialog contactId={contact.id} open={lifeOpen} onOpenChange={setLifeOpen} />
      <BetDialog contact={contact} open={betOpen} onOpenChange={setBetOpen} />
    </div>
  );
}
