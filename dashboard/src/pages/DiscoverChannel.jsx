import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { catalogChannel, catalogUrl } from "../data/channelCatalog.js";
import { Badge, Button } from "../components/ui/button.jsx";
import { api, emitLibraryChange, onLibraryChange } from "../lib/api.js";

export function DiscoverChannelPage() {
  const { id } = useParams();
  const channel = catalogChannel(id);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [localSlug, setLocalSlug] = useState("");

  useEffect(() => {
    if (!channel) return undefined;
    let active = true;
    const load = () => {
      api("/api/channels")
        .then((data) => {
          if (!active) return;
          const handle = channel.handle.toLowerCase();
          const match = (data.channels || []).find((item) => {
            const itemHandle = String(item.handle || "").replace(/^@/, "").toLowerCase();
            const url = String(item.url || "").toLowerCase();
            return itemHandle === handle || url.includes(`/@${handle}`);
          });
          setLocalSlug(match?.slug || "");
        })
        .catch(() => {
          if (active) setLocalSlug("");
        });
    };
    load();
    const unsubscribe = onLibraryChange(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [channel]);

  async function scrape() {
    if (!channel) return;
    setBusy(true);
    try {
      const data = await api("/api/youtube/sync", {
        method: "POST",
        body: { channel: catalogUrl(channel), generateBlog: false },
      });
      setResult(data);
      if (data.channel?.slug) setLocalSlug(data.channel.slug);
      toast.success(`Scraped ${data.channel?.name || channel.name}. Saved ${data.saved}.`);
      emitLibraryChange();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (!channel) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">That channel is not in the catalog.</p>
        <Button variant="outline" asChild>
          <Link to="/discover">Back to channels</Link>
        </Button>
      </div>
    );
  }

  const url = catalogUrl(channel);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/discover" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            All channels
          </Link>
          <div className="mt-3 flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{channel.name}</h1>
            <Badge variant="outline">{channel.category}</Badge>
          </div>
          <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
            @{channel.handle}
          </a>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{channel.blurb}</p>
        </div>
        <Button className="shrink-0" onClick={scrape} disabled={busy}>
          {busy ? "Scraping…" : "Start scraping"}
        </Button>
      </div>
      <div className="rounded-lg border border-border p-4 text-sm leading-6 text-muted-foreground">
        <p>The agent runs on this machine. It fetches the channel, saves new videos, and writes each transcript to a Markdown file. Already archived videos are skipped. Each run takes the next batch of 20.</p>
        {localSlug ? (
          <p className="mt-3">
            <Link to={`/channels/${localSlug}`} className="font-medium text-foreground underline-offset-4 hover:underline">
              Open the saved library
            </Link>
          </p>
        ) : null}
        {result ? (
          <p className="mt-3 text-foreground">
            Saved {result.saved}. Already archived {result.alreadyArchived}. Found {result.found}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
