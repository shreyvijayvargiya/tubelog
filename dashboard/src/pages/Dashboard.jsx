import { useEffect, useState } from "react";
import { ArrowRight, Library, Plus } from "lucide-react";
import { toast } from "sonner";
import { AddContentDialog } from "../components/AddContentDialog.jsx";
import { VideoTable } from "../components/VideoTable.jsx";
import { Button, Card, Input } from "../components/ui/button.jsx";
import { Checkbox } from "../components/ui/dialog.jsx";
import { api, emitLibraryChange, onLibraryChange } from "../lib/api.js";
import { useConfig } from "../lib/useConfig.js";

export function DashboardPage() {
  const [videos, setVideos] = useState(null);
  const [channels, setChannels] = useState(null);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const { config } = useConfig();

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [videoData, channelData] = await Promise.all([api("/api/videos"), api("/api/channels")]);
        if (!active) return;
        setVideos(videoData.videos);
        setChannels(channelData.channels);
        setError("");
      } catch (err) {
        if (active) setError(err.message);
      }
    };
    load();
    const unsubscribe = onLibraryChange(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const loading = videos === null || channels === null;
  const empty = !loading && videos.length === 0 && channels.length === 0;
  const transcripts = (videos || []).filter((video) => video.transcriptAvailable).length;
  const blogs = (videos || []).filter((video) => video.blogGenerated).length;

  return (
    <div className="space-y-6">
      {empty ? (
        <EmptyLibrary defaultAi={Boolean(config?.ai?.enabled)} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Videos" value={videos?.length ?? "—"} />
            <Stat label="Transcripts" value={loading ? "—" : transcripts} />
            <Stat label="AI Blogs" value={loading ? "—" : blogs} />
            <Stat label="Channels" value={channels?.length ?? "—"} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Latest videos</h1>
              <p className="text-sm text-muted-foreground">Stored on this machine as Markdown.</p>
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Content
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <VideoTable videos={videos || []} loading={loading} limit={8} hideFilters onReload={() => emitLibraryChange()} />
        </>
      )}
      <AddContentDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </Card>
  );
}

function EmptyLibrary({ defaultAi }) {
  const [query, setQuery] = useState("");
  const [ai, setAi] = useState(defaultAi);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setAi(defaultAi);
  }, [defaultAi]);

  async function add(kind) {
    const value = query.trim();
    if (!value) {
      toast.error("Paste a YouTube channel or video first.");
      return;
    }
    setBusy(kind);
    try {
      if (kind === "channel") {
        const data = await api("/api/youtube/sync", { method: "POST", body: { channel: value, generateBlog: ai } });
        toast.success(`Synced ${data.channel?.name || "channel"}. Saved ${data.saved}.`);
      } else {
        const data = await api("/api/youtube/transcript", { method: "POST", body: { video: value, generateBlog: ai } });
        toast.success(data.title ? `Saved ${data.title}` : "Video saved.");
      }
      emitLibraryChange();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-2 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border">
        <Library className="h-5 w-5" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">TubeLog</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Turn any YouTube channel into your own local learning library.
      </p>
      <div className="mt-6 w-full space-y-3 text-left">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="YouTube channel URL or name"
          disabled={Boolean(busy)}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={ai} onCheckedChange={(checked) => setAi(checked === true)} disabled={Boolean(busy)} />
          Generate AI blogs
        </label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => add("channel")} disabled={Boolean(busy)}>
            {busy === "channel" ? "Syncing…" : "Add Channel"}
          </Button>
          <Button variant="outline" onClick={() => add("video")} disabled={Boolean(busy)}>
            {busy === "video" ? "Saving…" : "Add Video"}
          </Button>
        </div>
      </div>
      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <span>Videos</span>
        <ArrowRight className="h-3 w-3" />
        <span>Transcripts</span>
        <ArrowRight className="h-3 w-3" />
        <span>AI Blogs</span>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Everything is stored locally as Markdown. No account and no database.
      </p>
    </div>
  );
}
