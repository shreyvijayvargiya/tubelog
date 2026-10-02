import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { AddContentDialog } from "../components/AddContentDialog.jsx";
import { Button, Card } from "../components/ui/button.jsx";
import { Skeleton } from "../components/ui/button.jsx";
import { api, onLibraryChange } from "../lib/api.js";
import { formatStamp } from "../lib/utils.js";

function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function ChannelsPage() {
  const [channels, setChannels] = useState(null);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      api("/api/channels")
        .then((data) => {
          if (!active) return;
          setChannels(data.channels);
          setError("");
        })
        .catch((err) => active && setError(err.message));
    };
    load();
    const unsubscribe = onLibraryChange(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Channels</h1>
          <p className="text-sm text-muted-foreground">Each channel is a folder of Markdown videos.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Channel
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {channels === null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : null}
      {channels && channels.length === 0 ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">No channels yet.</Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {(channels || []).map((channel) => (
          <Link key={channel.slug} to={`/channels/${channel.slug}`} className="block">
            <Card className="flex gap-3 p-4 transition hover:bg-accent/40">
              {channel.thumbnail ? (
                <img src={channel.thumbnail} alt="" className="h-14 w-14 rounded-md object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-muted text-sm font-medium">
                  {channel.name.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="truncate font-medium">{channel.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {countLabel(channel.videoCount, "video", "videos")} · {countLabel(channel.transcriptCount, "transcript", "transcripts")} · {countLabel(channel.blogCount, "blog", "blogs")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Updated {formatStamp(channel.updatedAt)}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <AddContentDialog open={addOpen} onOpenChange={setAddOpen} defaultTab="channel" />
    </div>
  );
}
