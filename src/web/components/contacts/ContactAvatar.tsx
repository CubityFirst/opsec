import type { ContactRef } from "@shared/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ContactAvatar({
  contact,
  className,
}: {
  contact: Pick<ContactRef, "displayName" | "avatarUrl" | "kind">;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8", className)}>
      {contact.avatarUrl && <AvatarImage src={contact.avatarUrl} alt={contact.displayName} className="object-cover" />}
      <AvatarFallback className="text-[0.7em] font-medium uppercase">{contact.kind === "pet" ? "🐾" : initials(contact.displayName)}</AvatarFallback>
    </Avatar>
  );
}
