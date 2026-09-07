import { CalendarIcon, CircleIcon, GiftIcon, MailIcon, MessageSquareIcon, PhoneIcon, StickyNoteIcon, UsersIcon, UtensilsIcon, type LucideIcon } from "lucide-react";
import type { InteractionType } from "@shared/schemas/common";

export const INTERACTION_ICONS: Record<InteractionType, LucideIcon> = {
  call: PhoneIcon,
  text: MessageSquareIcon,
  email: MailIcon,
  meeting: UsersIcon,
  meal: UtensilsIcon,
  gift: GiftIcon,
  event: CalendarIcon,
  note: StickyNoteIcon,
  other: CircleIcon,
};
