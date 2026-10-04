import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CATALOG_CATEGORIES, CHANNEL_CATALOG, catalogUrl } from "../data/channelCatalog.js";
import { Badge, Button, Card, Input } from "../components/ui/button.jsx";
import { cn } from "../lib/utils.js";

export function DiscoverPage() {
  return <ChannelCatalog />;
}

export function ChannelCatalog() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");

  const channels = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CHANNEL_CATALOG.filter((channel) => {
      if (category !== "All" && channel.category !== category) return false;
      if (!needle) return true;
      return `${channel.name} ${channel.handle} ${channel.blurb}`.toLowerCase().includes(needle);
    });
  }, [category, query]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Channels to scrape</h2>
        <p className="text-sm text-muted-foreground">
          {CHANNEL_CATALOG.length} channels are already here. Open one and start the local agent.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search channels"
          className="sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          {["All", ...CATALOG_CATEGORIES].map((item) => (
            <Button key={item} size="sm" variant={category === item ? "default" : "outline"} onClick={() => setCategory(item)}>
              {item}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {channels.map((channel) => (
          <Link key={channel.id} to={`/discover/${channel.id}`} className="block">
            <Card className="h-full p-4 transition hover:bg-accent/40">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-medium">
                  {channel.name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-medium">{channel.name}</h3>
                    <Badge variant="outline">{channel.category}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">@{channel.handle}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{channel.blurb}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      {channels.length === 0 ? <p className={cn("text-sm text-muted-foreground")}>No channels match.</p> : null}
      <p className="text-xs text-muted-foreground">
        Example:{" "}
        <a className="underline underline-offset-4" href={catalogUrl(CHANNEL_CATALOG.find((channel) => channel.id === "ycombinator"))} target="_blank" rel="noreferrer">
          Y Combinator
        </a>
        {" · "}
        <a className="underline underline-offset-4" href={catalogUrl(CHANNEL_CATALOG.find((channel) => channel.id === "gregisenberg"))} target="_blank" rel="noreferrer">
          Greg Isenberg
        </a>
      </p>
    </div>
  );
}
