import { BellIcon, LayoutDashboardIcon, LogOutIcon, MenuIcon, SearchIcon, SparklesIcon, TagIcon, UserIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { initials } from "@/lib/format";
import { useAuthUser, useLogout } from "@/lib/queries/auth";
import { cn } from "@/lib/utils";
import { CommandSearch } from "./CommandSearch";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboardIcon, end: true },
  { to: "/contacts", label: "Contacts", icon: UsersIcon },
  { to: "/reminders", label: "Reminders", icon: BellIcon },
  { to: "/tags", label: "Tags", icon: TagIcon },
  { to: "/ask", label: "Ask", icon: SparklesIcon },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function UserMenu() {
  const user = useAuthUser();
  const logout = useLogout();
  const navigate = useNavigate();
  if (!user) return null;
  const label = user.name ?? user.email ?? user.sub;
  if (user.authMode === "open") {
    return (
      <Button variant="ghost" className="h-auto w-full min-w-0 justify-start gap-2 px-2 py-1.5" onClick={() => navigate("/account")} title="Open access: no sign-in is configured">
        <Avatar className="size-7">
          <AvatarFallback className="text-[0.65rem] uppercase">{initials(label)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-left text-sm">{label}</span>
        <Badge variant="outline" className="text-[0.6rem] text-muted-foreground">open</Badge>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full min-w-0 justify-start gap-2 px-2 py-1.5" aria-label="Account menu">
          <Avatar className="size-7">
            {user.picture && <AvatarImage src={user.picture} alt="" />}
            <AvatarFallback className="text-[0.65rem] uppercase">{initials(label)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-left text-sm">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{label}</div>
          {user.email && <div className="truncate text-xs text-muted-foreground">{user.email}</div>}
          {user.isAdmin && <div className="mt-1 text-xs text-muted-foreground">admin</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/account")}>
          <UserIcon /> Account
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logout.mutate()}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Brand() {
  return (
    <NavLink to="/" className="flex items-center px-3 font-mono text-2xl font-bold tracking-tight">
      opsec▮
    </NavLink>
  );
}

export function AppShell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col gap-6 overflow-y-auto border-r bg-sidebar p-3 md:flex">
        <div className="pt-2">
          <Brand />
        </div>
        <Button variant="outline" className="justify-start text-muted-foreground" onClick={() => setSearchOpen(true)}>
          <SearchIcon />
          Search
          <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">Ctrl K</kbd>
        </Button>
        <NavItems />
        <div className="mt-auto flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <UserMenu />
          </div>
          <div className="shrink-0">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-3">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex flex-col gap-6 pt-6">
                <Brand />
                <NavItems onNavigate={() => setMobileOpen(false)} />
                <div className="mt-auto flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <UserMenu />
                  </div>
                  <div className="shrink-0">
                    <ThemeToggle />
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <Brand />
          <Button variant="ghost" size="icon" className="ml-auto" aria-label="Search" onClick={() => setSearchOpen(true)}>
            <SearchIcon />
          </Button>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>

      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
