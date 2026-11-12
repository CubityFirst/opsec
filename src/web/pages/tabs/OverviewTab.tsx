import { MentionText } from "@/components/MentionText";
import { CakeIcon, CalendarIcon, CalendarPlusIcon, CompassIcon, HistoryIcon, GlobeIcon, HandshakeIcon, MessageSquarePlusIcon, PencilIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Link, useOutletContext } from "react-router";
import { toast } from "sonner";
import { observanceLabel } from "@shared/religion";
import type { ContactMethodType } from "@shared/schemas/common";
import type { ContactMethodOut } from "@shared/types";
import { ContactFieldDialog, type ContactFieldGroup } from "@/components/contacts/ContactFieldDialog";
import { CountryFlag } from "@/components/contacts/CountryFlag";
import { ContactMethodDialog } from "@/components/contacts/ContactMethodDialog";
import { CustomFieldsEditor } from "@/components/contacts/CustomFieldsEditor";
import { ContactLocationsCard } from "@/components/map/ContactLocationsCard";
import { InteractionDialog } from "@/components/interactions/InteractionDialog";
import { BetCard, describeRecord } from "@/components/bets/BetCard";
import { BetDialog } from "@/components/bets/BetDialog";
import { GiftCard, describeGiftCounts } from "@/components/gifts/GiftCard";
import { GiftDialog } from "@/components/gifts/GiftDialog";
import { ReminderCard } from "@/components/reminders/ReminderCard";
import { ReminderDialog } from "@/components/reminders/ReminderDialog";
import { LifeEventCard } from "@/components/life-events/LifeEventCard";
import { LifeEventDialog } from "@/components/life-events/LifeEventDialog";
import { useContactBets } from "@/lib/queries/bets";
import { useContactGifts } from "@/lib/queries/gifts";
import { useContactReminders } from "@/lib/queries/reminders";
import { useLifeEvents } from "@/lib/queries/life-events";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage } from "@/lib/api";
import { INTERACTION_LABELS, METHOD_TYPE_LABELS, formatDate, formatRelative, formatBirthday } from "@/lib/format";
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
  /** One line of the About card at a time; the full form stays behind "Edit all details". */
  const [fieldEdit, setFieldEdit] = useState<ContactFieldGroup | null>(null);
  const socials = contact.methods.filter((m) => m.type === "social");
  const addresses = contact.methods.filter((m) => m.type === "address");
  const details = contact.methods.filter((m) => m.type !== "social" && m.type !== "address");
  const [logOpen, setLogOpen] = useState(false);
  const [lifeOpen, setLifeOpen] = useState(false);
  const [betOpen, setBetOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [allGifts, setAllGifts] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [allDoneReminders, setAllDoneReminders] = useState(false);
  const [allSettled, setAllSettled] = useState(false);
  const lifeEvents = useLifeEvents(contact.id);
  const bets = useContactBets(contact.id);
  const gifts = useContactGifts(contact.id);
  const reminders = useContactReminders(contact.id);
  const reminderItems = reminders.data?.items ?? [];
  const openReminders = reminderItems.filter((r) => r.status === "open");
  const doneReminders = reminderItems.filter((r) => r.status === "done");
  const betItems = bets.data?.items ?? [];
  const openBets = betItems.filter((b) => b.status === "open");
  const settledBets = betItems.filter((b) => b.status === "settled");
  const giftItems = gifts.data?.items ?? [];
  const giftIdeas = giftItems.filter((g) => g.status === "idea");
  const giftHistory = giftItems.filter((g) => g.status !== "idea");
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
    // Below lg both columns dissolve into one list ordered by what matters on a
    // phone (when you last spoke, how to reach them, who they are); above lg the
    // two columns come back with the summary cards on the right.
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
      <div className="contents lg:flex lg:flex-col lg:gap-6">
        <Card className="order-2 lg:order-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{contact.kind === "person" ? "Phone & email" : "Contact details"}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setMethodDialog({ open: true, initialType: "phone" })}>
              <PlusIcon /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {details.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="divide-y">
                {details.map((m) => {
                  const href = methodHref(m);
                  return (
                    <li key={m.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate">{[METHOD_TYPE_LABELS[m.type], m.label && m.label.toLowerCase() !== METHOD_TYPE_LABELS[m.type].toLowerCase() ? m.label : null].filter(Boolean).join(" · ")}</span>
                          {m.isPrimary && <StarIcon className="size-3 shrink-0 fill-current" aria-label="Primary" />}
                        </div>
                        <div className="text-sm whitespace-pre-line [overflow-wrap:anywhere]">
                          {href ? (
                            <a href={href} target={m.type === "url" ? "_blank" : undefined} rel="noreferrer" className="hover:underline">
                              {m.value}
                            </a>
                          ) : (
                            m.value
                          )}
                        </div>
                      </div>
                      <div className="-mr-1.5 flex shrink-0 items-center">
                        <Button variant="ghost" size="icon-sm" aria-label="Edit" title="Edit" onClick={() => setMethodDialog({ open: true, method: m })}>
                          <PencilIcon />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Remove" title="Remove" onClick={() => void onDeleteMethod(m)}>
                          <Trash2Icon />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="order-4 lg:order-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Social</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setMethodDialog({ open: true, initialType: "social" })}>
              <PlusIcon /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {socials.length === 0 ? (
              <p className="text-sm text-muted-foreground">No profiles yet. Paste a profile URL to add one.</p>
            ) : (
              <ul className="divide-y">
                {socials.map((m) => {
                  const s = describeSocial(m.label, m.value);
                  return (
                    <li key={m.id} className="group flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
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
                      <div className="-mr-1.5 flex shrink-0 items-center">
                        <Button variant="ghost" size="icon-sm" aria-label="Edit" title="Edit" onClick={() => setMethodDialog({ open: true, method: m })}>
                          <PencilIcon />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Remove" title="Remove" onClick={() => void onDeleteMethod(m)}>
                          <Trash2Icon />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="order-7 lg:order-none">
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
              <p className="text-sm text-muted-foreground">{contact.kind === "person" ? "No life events yet: jobs, moves, weddings, trips." : contact.kind === "pet" ? "No life events yet: adoption, moves, vet milestones." : "No life events yet: founding, moves, mergers."}</p>
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


        <Card className="order-8 lg:order-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Gifts
              {gifts.data && giftItems.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{describeGiftCounts(gifts.data.counts)}</span>}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setGiftOpen(true)}>
              <PlusIcon /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {gifts.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : giftItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No gifts yet: ideas for later, and what changed hands.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {giftIdeas.map((g) => (
                  <GiftCard key={g.id} gift={g} compact />
                ))}
                {(allGifts ? giftHistory : giftHistory.slice(0, 3)).map((g) => (
                  <GiftCard key={g.id} gift={g} compact />
                ))}
                {giftHistory.length > 3 && (
                  <button type="button" className="self-start text-xs text-muted-foreground underline" onClick={() => setAllGifts((v) => !v)}>
                    {allGifts ? "Show fewer" : `Show ${giftHistory.length - 3} more`}
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {contact.kind !== "pet" && (
          <Card className="order-9 lg:order-none">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                Bets
                {bets.data && betItems.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{describeRecord(bets.data.record)}</span>}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setBetOpen(true)}>
                <PlusIcon /> Add
              </Button>
            </CardHeader>
            <CardContent>
              {bets.isPending ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : betItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bets yet: a prediction, a wager and the day you will know.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {openBets.map((b) => (
                    <BetCard key={b.id} bet={b} compact />
                  ))}
                  {(allSettled ? settledBets : settledBets.slice(0, 3)).map((b) => (
                    <BetCard key={b.id} bet={b} compact />
                  ))}
                  {settledBets.length > 3 && (
                    <button type="button" className="self-start text-xs text-muted-foreground underline" onClick={() => setAllSettled((v) => !v)}>
                      {allSettled ? "Show fewer" : `Show ${settledBets.length - 3} more settled`}
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="order-10 lg:order-none">
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {contact.notes ? (
              <MarkdownBody className="prose prose-sm max-w-none text-foreground dark:prose-invert [&_h1]:text-lg [&_h2]:text-base [&_p]:mb-2">{contact.notes}</MarkdownBody>
            ) : (
              <p className="text-sm text-muted-foreground">No notes yet. Use Edit to add some (markdown works).</p>
            )}
          </CardContent>
        </Card>

        <div className="order-11 lg:order-none">
          <CustomFieldsEditor contact={contact} />
        </div>
      </div>

      <div className="contents lg:flex lg:flex-col lg:gap-6">
        <Card className="order-1 lg:order-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{contact.kind === "person" ? "Last spoke" : "Last interaction"}</CardTitle>
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

        <Card className="order-3 lg:order-none">
          <CardHeader>
            <CardTitle className="text-base">About</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="flex items-center gap-1 text-muted-foreground">
                {contact.kind === "organization" ? <CalendarIcon className="size-3.5" /> : <CakeIcon className="size-3.5" />} {contact.kind === "organization" ? "Founded" : "Birthday"}
              </dt>
              <dd>
                {contact.birthday ? (
                  <button type="button" onClick={() => setFieldEdit("birthday")} className="text-left hover:underline" title="Edit birthday">
                    {formatBirthday(contact.birthday)}
                  </button>
                ) : (
                  <button type="button" onClick={() => setFieldEdit("birthday")} className="text-muted-foreground hover:text-foreground hover:underline">
                    Add {contact.kind === "organization" ? "founding date" : "birthday"}…
                  </button>
                )}
              </dd>
              {contact.kind === "person" && (
                <>
                  <dt className="flex items-center gap-1 text-muted-foreground">
                    <CompassIcon className="size-3.5" /> Religion
                  </dt>
                  <dd>
                    {contact.religion ? (
                      <button type="button" onClick={() => setFieldEdit("religion")} className="text-left hover:underline" title="Edit religion">
                        {contact.religion}
                        {observanceLabel(contact.religionObservance) && (
                          <span className="text-muted-foreground"> · {observanceLabel(contact.religionObservance)?.toLowerCase()}</span>
                        )}
                      </button>
                    ) : (
                      <button type="button" onClick={() => setFieldEdit("religion")} className="text-muted-foreground hover:text-foreground hover:underline">
                        Add religion…
                      </button>
                    )}
                  </dd>
                </>
              )}
              <dt className="flex items-center gap-1 text-muted-foreground">
                <GlobeIcon className="size-3.5" /> From
              </dt>
              <dd>
                {contact.originCountry ? (
                  <button type="button" onClick={() => setFieldEdit("originCountry")} className="flex items-center gap-1.5 text-left hover:underline" title="Edit country">
                    <CountryFlag country={contact.originCountry} />
                    {contact.originCountry}
                  </button>
                ) : (
                  <button type="button" onClick={() => setFieldEdit("originCountry")} className="text-muted-foreground hover:text-foreground hover:underline">
                    Add country…
                  </button>
                )}
              </dd>
              <dt className="flex items-center gap-1 text-muted-foreground">
                <HandshakeIcon className="size-3.5" /> Met
              </dt>
              <dd>
                {contact.metOn || contact.metWhere || contact.metHow || contact.metVia ? (
                  <button type="button" onClick={() => setFieldEdit("met")} className="group flex flex-col items-start gap-0.5 text-left" title="Edit how you met">
                    <span className="group-hover:underline">
                      {[contact.metOn && formatBirthday(contact.metOn).split(" (")[0], contact.metWhere && `at ${contact.metWhere}`].filter(Boolean).join(" ") || "—"}
                    </span>
                    {contact.metHow && <span className="text-muted-foreground">{contact.metHow}</span>}
                  </button>
                ) : (
                  <button type="button" onClick={() => setFieldEdit("met")} className="text-muted-foreground hover:text-foreground hover:underline">
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
              <dt className="flex items-center gap-1 text-muted-foreground">
                <CalendarPlusIcon className="size-3.5" /> Added
              </dt>
              <dd>{formatDate(contact.createdAt)}</dd>
              <dt className="flex items-center gap-1 text-muted-foreground">
                <HistoryIcon className="size-3.5" /> Updated
              </dt>
              <dd>{formatRelative(contact.updatedAt)}</dd>
            </dl>
            <button type="button" onClick={openEdit} className="mt-3 text-xs text-muted-foreground hover:text-foreground hover:underline">
              Edit all details…
            </button>
          </CardContent>
        </Card>

        <div className="order-5 lg:order-none">
          <ContactLocationsCard contact={contact} addresses={addresses} />
        </div>

        <Card className="order-6 lg:order-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Reminders
              {reminders.data && reminderItems.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {openReminders.length} open · {doneReminders.length} done
                </span>
              )}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setReminderOpen(true)}>
              <PlusIcon /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {reminders.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : reminderItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reminders yet: a call to make, a date to remember, something monthly.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {openReminders.map((r) => (
                  <ReminderCard key={r.id} reminder={r} compact />
                ))}
                {(allDoneReminders ? doneReminders : doneReminders.slice(0, 2)).map((r) => (
                  <ReminderCard key={r.id} reminder={r} compact />
                ))}
                {doneReminders.length > 2 && (
                  <button type="button" className="self-start text-xs text-muted-foreground underline" onClick={() => setAllDoneReminders((v) => !v)}>
                    {allDoneReminders ? "Show fewer" : `Show ${doneReminders.length - 2} more done`}
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ContactFieldDialog contact={contact} group={fieldEdit} onOpenChange={setFieldEdit} />
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
      <GiftDialog contact={contact} open={giftOpen} onOpenChange={setGiftOpen} />
      <ReminderDialog contact={contact} open={reminderOpen} onOpenChange={setReminderOpen} />
    </div>
  );
}
