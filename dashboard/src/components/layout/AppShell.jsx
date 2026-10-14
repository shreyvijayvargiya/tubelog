import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BookOpen, Check, ChevronDown, ChevronsUpDown, Clapperboard, Compass, FileText, Github, LayoutDashboard, Library, Lightbulb, Megaphone, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Plus, Settings, Star, Sun, Tv, Youtube } from "lucide-react";
import { api, onLibraryChange } from "../../lib/api.js";
import { useActiveChannel } from "../../lib/activeChannel.jsx";
import { useConfig } from "../../lib/useConfig.js";
import { cn } from "../../lib/utils.js";
import { useTheme } from "../../lib/theme.jsx";
import { Button } from "../ui/button.jsx";
import { DialogTitle, Sheet, SheetContent } from "../ui/dialog.jsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip, TooltipContent, TooltipTrigger } from "../ui/menu.jsx";

// The sidebar is grouped by what you are doing: look around, browse the library, make something, or read about it.
const NAV_GROUPS = [
  { id: "workspace", label: "Workspace", items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }] },
  {
    id: "library",
    label: "Library",
    items: [
      { to: "/discover", label: "Discover", icon: Compass },
      { to: "/channels", label: "Channels", icon: Tv },
      { to: "/videos", label: "Videos", icon: Youtube },
      { to: "/blogs", label: "Blogs", icon: BookOpen },
    ],
  },
  {
    id: "create",
    label: "Create",
    items: [
      { to: "/ideas", label: "Ideas", icon: Lightbulb },
      { to: "/studio", label: "Studio", icon: Clapperboard },
    ],
  },
  {
    id: "resources",
    label: "Resources",
    items: [
      { to: "/docs", label: "Docs", icon: FileText },
      { to: "/changelog", label: "Changelog", icon: Megaphone },
    ],
  },
];
const FOOTER_NAV = [{ to: "/settings", label: "Settings", icon: Settings }];
const SIDEBAR_KEY = "tubelog.sidebar";

function readSidebarState() {
  try {
    const data = JSON.parse(localStorage.getItem(SIDEBAR_KEY) || "{}");
    return { collapsed: data.collapsed === true, closed: Array.isArray(data.closed) ? data.closed.filter((id) => typeof id === "string") : [] };
  } catch {
    return { collapsed: false, closed: [] };
  }
}

function saveSidebarState(patch) {
  try {
    localStorage.setItem(SIDEBAR_KEY, JSON.stringify({ ...readSidebarState(), ...patch }));
  } catch {
    /* storage can be unavailable */
  }
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readSidebarState().collapsed);
  const [channels, setChannels] = useState([]);
  const { config } = useConfig();
  const github = config?.github || "https://github.com/shreyvijayvargiya/tubelog";

  useEffect(() => {
    let active = true;
    const load = () => {
      api("/api/channels")
        .then((data) => {
          if (active) setChannels(data.channels || []);
        })
        .catch(() => {
          if (active) setChannels([]);
        });
    };
    load();
    const unsubscribe = onLibraryChange(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="flex h-screen gap-2 overflow-hidden bg-muted p-2 text-foreground">
      <aside className={cn("hidden shrink-0 overflow-hidden rounded-2xl border border-border bg-background md:flex md:flex-col", collapsed ? "w-14" : "w-60")}>
        <Sidebar channels={channels} collapsed={collapsed} onToggle={() => setCollapsed((value) => { saveSidebarState({ collapsed: !value }); return !value; })} />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <Sidebar channels={channels} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background">
        <header className="border-b border-border">
          <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <span className="font-semibold tracking-tight md:hidden">TubeLog</span>
            <SearchBox />
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <ThemeMenu />
              <Button variant="ghost" size="icon" asChild>
                <a href={github} target="_blank" rel="noreferrer" aria-label="GitHub">
                  <Github className="h-4 w-4" />
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={github} target="_blank" rel="noreferrer">
                  <Star className="h-4 w-4" />
                  <span className="hidden lg:inline">Star on GitHub</span>
                </a>
              </Button>
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  return (
    <form
      className="min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("q");
        navigate(`/videos?q=${encodeURIComponent(String(value || "").trim())}`);
      }}
    >
      <input
        name="q"
        placeholder="Search your library"
        className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </form>
  );
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme">
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setTheme("light")}>
          <Sun className="h-4 w-4" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("dark")}>
          <Moon className="h-4 w-4" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("system")}>
          <Monitor className="h-4 w-4" /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChannelSwitcher({ onNavigate }) {
  const navigate = useNavigate();
  const { channels, active, setActive } = useActiveChannel();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex max-w-[9.5rem] items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-label="Switch channel">
          <span className="truncate">{active?.name || "Add your channel"}</span>
          <ChevronsUpDown className="h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {channels.map((channel) => (
          <DropdownMenuItem key={channel.slug} onSelect={() => setActive(channel.slug)}>
            <Check className={cn("h-4 w-4", active?.slug === channel.slug ? "opacity-100" : "opacity-0")} />
            {channel.name}
          </DropdownMenuItem>
        ))}
        {channels.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          onSelect={() => {
            onNavigate?.();
            navigate("/my-channels/new");
          }}
        >
          <Plus className="h-4 w-4" /> Add my channel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavItem({ item, collapsed, onNavigate }) {
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-2.5 rounded-md py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          collapsed ? "justify-center px-2" : "px-3",
          isActive ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed ? <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-foreground" aria-hidden="true" /> : null}
          <item.icon className="h-4 w-4 shrink-0" />
          {collapsed ? null : <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function NavGroup({ id, label, count, collapsed, open, onToggle, children }) {
  if (collapsed) {
    return (
      <div className="mx-2 mt-2 space-y-0.5 border-t border-border pt-2 first:mt-0 first:border-t-0 first:pt-0">
        {children}
      </div>
    );
  }
  const panel = `sidebar-group-${id}`;
  return (
    <div className="px-2 pb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panel}
        className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>
          {label}
          {typeof count === "number" ? <span className="ml-1.5 font-normal normal-case tracking-normal">{count}</span> : null}
        </span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open ? "" : "-rotate-90")} aria-hidden="true" />
      </button>
      <div id={panel} hidden={!open} className="space-y-0.5 pt-0.5">
        {children}
      </div>
    </div>
  );
}

function ChannelLink({ channel, mine, onNavigate }) {
  return (
    <NavLink
      to={`/channels/${channel.slug}`}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          isActive ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
        )
      }
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-background text-[10px] font-semibold uppercase text-foreground" aria-hidden="true">
        {(channel.name || "?").trim().charAt(0)}
      </span>
      <span className="min-w-0 flex-1 truncate">{channel.name}</span>
      {mine ? <span className="shrink-0 rounded border border-border px-1 text-[10px] leading-4 text-muted-foreground">You</span> : null}
    </NavLink>
  );
}

function Sidebar({ channels, onNavigate, collapsed = false, onToggle }) {
  const { channels: mineList } = useActiveChannel();
  const mine = new Set(mineList.map((channel) => channel.slug));
  const [closed, setClosed] = useState(() => readSidebarState().closed);
  const isOpen = (id) => !closed.includes(id);
  const toggle = (id) =>
    setClosed((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      saveSidebarState({ closed: next });
      return next;
    });
  const sorted = [...channels].sort((a, b) => Number(mine.has(b.slug)) - Number(mine.has(a.slug)) || String(a.name).localeCompare(String(b.name)));

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 border-b border-border py-3", collapsed ? "justify-center px-2" : "px-3")}>
        {onToggle ? (
          <Button variant="ghost" size="icon" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={onToggle}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        ) : (
          <Library className="h-4 w-4" />
        )}
        {collapsed ? null : (
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">TubeLog</p>
            <ChannelSwitcher onNavigate={onNavigate} />
          </div>
        )}
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => (
          <NavGroup key={group.id} id={group.id} label={group.label} collapsed={collapsed} open={isOpen(group.id)} onToggle={() => toggle(group.id)}>
            {group.items.map((item) => (
              <NavItem key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </NavGroup>
        ))}
        {collapsed ? null : (
          <NavGroup id="channels" label="Saved channels" count={channels.length} collapsed={collapsed} open={isOpen("channels")} onToggle={() => toggle("channels")}>
            {sorted.length === 0 ? <p className="px-3 py-1.5 text-sm text-muted-foreground">No channels yet</p> : null}
            {sorted.map((channel) => (
              <ChannelLink key={channel.slug} channel={channel} mine={mine.has(channel.slug)} onNavigate={onNavigate} />
            ))}
          </NavGroup>
        )}
      </nav>

      <div className="border-t border-border px-2 py-2">
        <div className="space-y-0.5">
          {FOOTER_NAV.map((item) => (
            <NavItem key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </div>
  );
}
