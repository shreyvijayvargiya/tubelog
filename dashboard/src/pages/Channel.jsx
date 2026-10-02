import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { VideoTable } from "../components/VideoTable.jsx";
import { Button, Skeleton } from "../components/ui/button.jsx";
import { api, emitLibraryChange, onLibraryChange } from "../lib/api.js";

function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function ChannelPage() {
  const { slug } = useParams();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let active = true;
    const load = () => {
      api(`/api/channels/${slug}`)
        .then((data) => {
          if (!active) return;
          setPayload(data);
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
  }, [slug]);

  async function sync(generateBlog) {
    if (!payload?.channel?.url) return;
    setBusy(generateBlog ? "blogs" : "sync");
    try {
      const data = await api("/api/youtube/sync", {
        method: "POST",
        body: { channel: payload.channel.url, generateBlog },
      });
      toast.success(
        generateBlog
          ? `Generated ${data.blogsGenerated} blogs. Saved ${data.saved} videos.`
          : `Synced ${data.channel?.name}. Saved ${data.saved}. Already archived ${data.alreadyArchived}.`,
      );
      emitLibraryChange();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy("");
    }
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" asChild>
          <Link to="/channels">Back to channels</Link>
        </Button>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const { channel, videos } = payload;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {channel.thumbnail ? (
          <img src={channel.thumbnail} alt="" className="h-16 w-16 rounded-md object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{channel.name}</h1>
          {channel.url ? (
            <a href={channel.url} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              {channel.url}
            </a>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">
            {countLabel(channel.videoCount, "video", "videos")} · {countLabel(channel.transcriptCount, "transcript", "transcripts")} · {countLabel(channel.blogCount, "blog", "blogs")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => sync(false)} disabled={Boolean(busy)}>
            {busy === "sync" ? "Syncing…" : "Sync Channel"}
          </Button>
          <Button onClick={() => sync(true)} disabled={Boolean(busy)}>
            {busy === "blogs" ? "Generating…" : "Generate Missing Blogs"}
          </Button>
        </div>
      </div>
      <VideoTable videos={videos} lockedChannel={channel.slug} onReload={() => emitLibraryChange()} />
    </div>
  );
}
