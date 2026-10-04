import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BookOpen, Compass, Github, LayoutDashboard, Library, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Settings, Star, Sun, Tv, Youtube } from "lucide-react";
import { api, onLibraryChange } from "../../lib/api.js";
import { useConfig } from "../../lib/useConfig.js";
import { cn } from "../../lib/utils.js";
import { useTheme } from "../../lib/theme.jsx";
import { Button, Separator } from "../ui/button.jsx";
import { DialogTitle, Sheet, SheetContent } from "../ui/dialog.jsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/menu.jsx";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/channels", label: "Channels", icon: Tv },
  { to: "/videos", label: "Videos", icon: Youtube },
  { to: "/blogs", label: "Blogs", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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
        <Sidebar channels={channels} collapsed={collapsed} onToggle={() => setCollapsed((open) => !open)} />
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

function Sidebar({ channels, onNavigate, collapsed = false, onToggle }) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 py-3", collapsed ? "justify-center px-2" : "px-3")}>
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
            <p className="text-xs text-muted-foreground">Local library</p>
          </div>
        )}
      </div>
      <nav className="space-y-1 px-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-md py-2 text-sm",
                collapsed ? "justify-center px-2" : "px-3",
                isActive ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {collapsed ? null : item.label}
          </NavLink>
        ))}
      </nav>
      {collapsed ? null : (
        <>
          <Separator className="my-3" />
          <div className="px-4 pb-2 text-xs font-medium tracking-wide text-muted-foreground">LIBRARY</div>
        </>
      )}
      <div className={cn("min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4", collapsed && "hidden")}>
        {channels.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">No channels yet</p> : null}
        {channels.map((channel) => (
          <NavLink
            key={channel.slug}
            to={`/channels/${channel.slug}`}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "block truncate rounded-md px-3 py-2 text-sm",
                isActive ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            {channel.name}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
