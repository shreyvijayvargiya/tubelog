import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, FileText, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api, onLibraryChange } from "../lib/api.js";
import { copyText, formatDuration, formatPublished, proseToMarkdown, transcriptToMarkdown } from "../lib/utils.js";
import { MarkdownView } from "./MarkdownView.jsx";
import { Badge, Button, Separator, Skeleton } from "./ui/button.jsx";
import { DialogTitle, Sheet, SheetContent } from "./ui/dialog.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.jsx";

export function VideoSheet({ videoId, open, onOpenChange, tab = "overview", onTabChange, onGenerate }) {
  const [video, setVideo] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const blogRef = useRef("");
  const onTabChangeRef = useRef(onTabChange);
  onTabChangeRef.current = onTabChange;

  useEffect(() => {
    if (!open || !videoId) return undefined;
    let active = true;
    blogRef.current = "";
    setVideo(null);
    setLoading(true);
    setError("");

    const load = (quiet) => {
      api(`/api/videos/${videoId}`)
        .then((data) => {
          if (!active) return;
          const nextBlog = data.video?.blog || "";
          if (quiet && nextBlog && nextBlog !== blogRef.current) onTabChangeRef.current?.("blog");
          blogRef.current = nextBlog;
          setVideo(data.video);
          setError("");
        })
        .catch((err) => {
          if (active && !quiet) setError(err.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    load(false);
    const unsubscribe = onLibraryChange(() => load(true));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [open, videoId]);

  async function copyBlog() {
    if (!video?.blog) return;
    await copyText(video.blog);
    toast.success("Blog copied.");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{video?.channel || "Video"}</p>
            <DialogTitle className="mt-1 text-lg font-semibold leading-snug tracking-tight">{video?.title || "Video"}</DialogTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{formatPublished(video?.publishedAt)}</span>
              <span>{formatDuration(video?.duration)}</span>
              {video?.transcriptAvailable ? <Badge>Available</Badge> : <Badge variant="outline">Unavailable</Badge>}
              {video?.blogGenerated ? <Badge>Generated</Badge> : <Badge variant="outline">Not generated</Badge>}
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
          {video?.url ? (
            <Button variant="outline" size="sm" asChild>
              <a href={video.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                YouTube
              </a>
            </Button>
          ) : null}
          <Button size="sm" onClick={() => video && onGenerate?.(video)} disabled={!video}>
            <Sparkles className="h-4 w-4" />
            Generate Blog
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {video?.id ? (
            <div className="mb-4 overflow-hidden rounded-xl border border-border bg-black">
              <iframe
                className="aspect-video w-full"
                src={`https://www.youtube.com/embed/${video.id}`}
                title={video.title || "YouTube video"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : null}
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {video && !loading ? (
            <Tabs value={tab} onValueChange={onTabChange}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
                <TabsTrigger value="blog">AI Blog</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="space-y-4">
                {video.description ? (
                  <MarkdownView>{proseToMarkdown(video.description)}</MarkdownView>
                ) : (
                  <p className="text-sm text-muted-foreground">No description saved.</p>
                )}
                <Separator />
                <p className="break-all text-xs text-muted-foreground">{video.markdownPath}</p>
              </TabsContent>
              <TabsContent value="transcript">
                {video.transcriptAvailable && video.transcript ? (
                  <MarkdownView>{transcriptToMarkdown(video.transcript)}</MarkdownView>
                ) : (
                  <p className="text-sm text-muted-foreground">Transcript unavailable.</p>
                )}
              </TabsContent>
              <TabsContent value="blog">
                {video.blogGenerated && video.blog ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => onGenerate?.(video)}>
                        <RefreshCw className="h-4 w-4" />
                        Regenerate
                      </Button>
                      <Button variant="outline" size="sm" onClick={copyBlog}>
                        <Copy className="h-4 w-4" />
                        Copy
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/api/videos/${video.id}/markdown`} target="_blank" rel="noreferrer">
                          <FileText className="h-4 w-4" />
                          Open Markdown
                        </a>
                      </Button>
                    </div>
                    <MarkdownView>{video.blog}</MarkdownView>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">No AI blog generated yet.</p>
                    <Button onClick={() => onGenerate?.(video)}>
                      <Sparkles className="h-4 w-4" />
                      Generate Blog
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
