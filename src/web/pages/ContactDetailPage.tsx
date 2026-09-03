import { ArchiveIcon, ArchiveRestoreIcon, CameraIcon, DownloadIcon, ExpandIcon, MailIcon, MoreHorizontalIcon, PencilIcon, PhoneIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { describeSocial } from "@shared/social";
import type { ContactDetail } from "@shared/types";
import { AvatarCropDialog } from "@/components/contacts/AvatarCropDialog";
import { ContactAvatar } from "@/components/contacts/ContactAvatar";
import { SocialIcon } from "@/components/contacts/SocialIcon";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import { JobEditor } from "@/components/contacts/JobEditor";
import { KindBadge } from "@/components/contacts/KindBadge";
import { TagPicker } from "@/components/contacts/TagPicker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAuthUser } from "@/lib/queries/auth";
import { useArchiveContact, useContact, useDeleteAvatar, useDeleteContact, useUploadAvatar } from "@/lib/queries/contacts";
import { cn } from "@/lib/utils";
import { ErrorState } from "./ContactsPage";

const TABS = [
  { to: "overview", label: "Overview" },
  { to: "relationships", label: "Relationships" },
  { to: "activity", label: "Activity" },
  { to: "files", label: "Files" },
];

export type ContactOutletContext = { contact: ContactDetail; openEdit: () => void };

export function ContactDetailPage() {
  const { id } = useParams();
  const query = useContact(id);
  const [editOpen, setEditOpen] = useState(false);

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return <ErrorState message={notFound ? "This contact does not exist." : errorMessage(query.error)} onRetry={notFound ? undefined : () => query.refetch()} />;
  }
  if (query.isPending) return <DetailSkeleton />;

  const contact = query.data;
  return (
    <div className="flex flex-col gap-6">
      <Header contact={contact} editOpen={editOpen} setEditOpen={setEditOpen} />
      {/* overflow-y-hidden: the tabs' -mb-px would otherwise trigger a 1px vertical scrollbar. */}
      <nav className="flex gap-1 overflow-x-auto overflow-y-hidden border-b">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )
            }
          >
            {t.label}
            {t.to === "relationships" && contact.relationshipCount > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{contact.relationshipCount}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ contact, openEdit: () => setEditOpen(true) } satisfies ContactOutletContext} />
    </div>
  );
}

function Header({ contact, editOpen, setEditOpen }: { contact: ContactDetail; editOpen: boolean; setEditOpen: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar(contact.id);
  const removeAvatar = useDeleteAvatar(contact.id);
  const archive = useArchiveContact(contact.id);
  const del = useDeleteContact();
  const isAdmin = useAuthUser()?.isAdmin ?? false;

  const [cropFile, setCropFile] = useState<File | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  const onPickAvatar = (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    setCropFile(file);
  };

  const onApplyCrop = async (cropped: Blob) => {
    if (!cropFile) return;
    try {
      await upload.mutateAsync({ cropped, original: cropFile });
      toast.success("Photo updated");
      setCropFile(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onArchive = async () => {
    try {
      await archive.mutateAsync(!contact.archivedAt);
      toast.success(contact.archivedAt ? "Contact restored" : "Contact archived");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onDelete = async () => {
    try {
      await del.mutateAsync(contact.id);
      toast.success(`Deleted ${contact.displayName}`);
      navigate("/contacts");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <button
        type="button"
        className="group relative shrink-0 self-start rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => (contact.avatarFullUrl ? setPhotoOpen(true) : fileRef.current?.click())}
        aria-label={contact.avatarFullUrl ? "View full photo" : "Add photo"}
        disabled={upload.isPending}
      >
        <ContactAvatar contact={contact} className="size-20 text-2xl" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
          {contact.avatarFullUrl ? <ExpandIcon className="size-5" /> : <CameraIcon className="size-5" />}
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickAvatar(e.target.files?.[0])} />

      {cropFile && <AvatarCropDialog file={cropFile} onApply={onApplyCrop} onClose={() => setCropFile(null)} />}

      <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
        <DialogContent className="w-auto max-w-[min(98vw,120rem)] p-2 sm:max-w-[min(98vw,120rem)] sm:p-3">
          <DialogHeader className="sr-only">
            <DialogTitle>{contact.displayName}</DialogTitle>
            <DialogDescription>Full-size photo</DialogDescription>
          </DialogHeader>
          {contact.avatarFullUrl && (
            <img src={contact.avatarFullUrl} alt={contact.displayName} className="mx-auto max-h-[calc(92vh-4.5rem)] w-auto max-w-full rounded-md object-contain" />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-sm font-medium">{contact.displayName}</span>
            <div className="flex gap-2">
              {contact.avatarFullUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`${contact.avatarFullUrl}?download=1`}>
                    <DownloadIcon /> Download
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setPhotoOpen(false);
                  fileRef.current?.click();
                }}
              >
                <CameraIcon /> Change photo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {contact.displayName}
            {contact.nickname && <span className="ml-2 text-lg font-normal text-muted-foreground">“{contact.nickname}”</span>}
            {contact.pronouns && <span className="ml-2 text-sm font-normal text-muted-foreground">{contact.pronouns}</span>}
          </h1>
          <KindBadge kind={contact.kind} />
          {contact.archivedAt && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArchiveIcon className="size-3" /> Archived {formatDate(contact.archivedAt)}
            </span>
          )}
        </div>
        {contact.kind === "person" && <JobEditor contact={contact} />}
        {contact.otherNames.length > 0 && (
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            {contact.otherNames.map((n, i) => (
              <span key={i}>
                <span className="text-foreground">{n.value}</span> <span className="text-xs">· {n.label}</span>
              </span>
            ))}
          </p>
        )}
        <TagPicker contact={contact} />
      </div>

      <div className="flex items-center gap-1 self-start">
        {contact.primaryPhone && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" asChild>
                <a href={`tel:${contact.primaryPhone}`} aria-label="Call">
                  <PhoneIcon />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{contact.primaryPhone}</TooltipContent>
          </Tooltip>
        )}
        {contact.primaryEmail && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" asChild>
                <a href={`mailto:${contact.primaryEmail}`} aria-label="Email">
                  <MailIcon />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{contact.primaryEmail}</TooltipContent>
          </Tooltip>
        )}
        {contact.methods
          .filter((m) => m.type === "social")
          .map((m) => {
            const s = describeSocial(m.label, m.value);
            if (!s.href) return null;
            return (
              <Tooltip key={m.id}>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" asChild>
                    <a href={s.href} target="_blank" rel="noreferrer" aria-label={`${s.platform.name}: ${s.handle}`}>
                      <SocialIcon platformKey={s.platform.key} className="size-4" brand />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {s.platform.name} · {s.handle}
                </TooltipContent>
              </Tooltip>
            );
          })}
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <PencilIcon /> Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
              <CameraIcon /> Change photo
            </DropdownMenuItem>
            {contact.avatarUrl && (
              <DropdownMenuItem onSelect={() => removeAvatar.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}>
                <Trash2Icon /> Remove photo
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void onArchive()}>
              {contact.archivedAt ? (
                <>
                  <ArchiveRestoreIcon /> Unarchive
                </>
              ) : (
                <>
                  <ArchiveIcon /> Archive
                </>
              )}
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                <Trash2Icon /> Delete permanently
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ContactFormDialog open={editOpen} onOpenChange={setEditOpen} contact={contact} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {contact.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the contact, their contact methods, relationships, activity, and files. Prefer archiving if you might want them back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-4">
        <Skeleton className="size-20 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
