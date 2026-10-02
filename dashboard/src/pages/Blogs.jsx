import { useEffect, useMemo, useState } from "react";
import { BlogDialog } from "../components/BlogDialog.jsx";
import { VideoSheet } from "../components/VideoSheet.jsx";
import { Button, Card, Input } from "../components/ui/button.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/tabs.jsx";
import { api, onLibraryChange } from "../lib/api.js";
import { formatPublished } from "../lib/utils.js";

export function BlogsPage() {
  const [videos, setVideos] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const [sheetId, setSheetId] = useState("");
  const [sheetTab, setSheetTab] = useState("blog");
  const [blogTarget, setBlogTarget] = useState(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      api("/api/videos?blog=generated")
        .then((data) => {
          if (!active) return;
          setVideos(data.videos);
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

  const channels = useMemo(() => {
    const map = new Map();
    for (const video of videos || []) map.set(video.channelSlug, video.channel);
    return [...map.entries()];
  }, [videos]);

  const rows = (videos || []).filter((video) => {
    if (channel !== "all" && video.channelSlug !== channel) return false;
    const haystack = `${video.title} ${video.channel} ${video.excerpt}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Blogs</h1>
        <p className="text-sm text-muted-foreground">Lessons generated from your transcripts.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search blogs" className="sm:max-w-xs" />
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            {channels.map(([slug, name]) => (
              <SelectItem key={slug} value={slug}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {videos && rows.length === 0 ? <p className="text-sm text-muted-foreground">No AI blogs yet.</p> : null}
      <div className="grid gap-3">
        {rows.map((video) => (
          <Card key={video.id} className="p-4">
            <h2 className="font-medium tracking-tight">{video.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {video.channel} · {formatPublished(video.publishedAt)}
            </p>
            {video.excerpt ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{video.excerpt}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setSheetTab("blog");
                  setSheetId(video.id);
                }}
              >
                Read
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBlogTarget({ id: video.id, title: video.title })}>
                Regenerate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSheetTab("overview");
                  setSheetId(video.id);
                }}
              >
                Open Video
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <VideoSheet
        videoId={sheetId}
        open={Boolean(sheetId)}
        tab={sheetTab}
        onTabChange={setSheetTab}
        onOpenChange={(next) => {
          if (!next) setSheetId("");
        }}
        onGenerate={(video) => setBlogTarget({ id: video.id, title: video.title })}
      />
      <BlogDialog
        videos={blogTarget ? [blogTarget] : []}
        open={Boolean(blogTarget)}
        onOpenChange={(next) => {
          if (!next) setBlogTarget(null);
        }}
      />
    </div>
  );
}
