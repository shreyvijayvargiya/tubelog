import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, FileText, Images, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api, onLibraryChange } from "../lib/api.js";
import { copyText, formatDuration, formatPublished, proseToMarkdown, transcriptToMarkdown } from "../lib/utils.js";
import { MarkdownView } from "./MarkdownView.jsx";
import { Badge, Button, Separator, Skeleton } from "./ui/button.jsx";
import { DialogTitle, Sheet, SheetContent } from "./ui/dialog.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.jsx";

export function VideoSheet({ videoId, open, onOpenChange, tab = "overview", onTabChange, onGenerate, onGenerateInstagram }) {
  const [video, setVideo] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const blogRef = useRef("");
  const igRef = useRef("");
  const onTabChangeRef = useRef(onTabChange);
  onTabChangeRef.current = onTabChange;

  useEffect(() => {
    if (!open || !videoId) return undefined;
    let active = true;
    blogRef.current = "";
    igRef.current = "";
    setVideo(null);
    setLoading(true);
    setError("");

    const load = (quiet) => {
      api(`/api/videos/${videoId}`)
        .then((data) => {
          if (!active) return;
          const nextBlog = data.video?.blog || "";
          const nextIg = data.video?.instagram?.generatedAt || "";
          if (quiet && nextBlog && nextBlog !== blogRef.current) onTabChangeRef.current?.("blog");
          if (quiet && nextIg && nextIg !== igRef.current) onTabChangeRef.current?.("instagram");
          blogRef.current = nextBlog;
          igRef.current = nextIg;
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

  async function copyCaption() {
    if (!video?.instagram?.caption) return;
    await copyText(video.instagram.caption);
    toast.success("Caption copied.");
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
          <Button size="sm" variant="outline" onClick={() => video && onGenerateInstagram?.(video)} disabled={!video}>
            <Images className="h-4 w-4" />
            Create IG posts
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
                <TabsTrigger value="instagram">IG Posts</TabsTrigger>
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
              <TabsContent value="instagram">
                {video.instagram?.generated && video.instagram.slides?.length ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => onGenerateInstagram?.(video)}>
                        <RefreshCw className="h-4 w-4" />
                        Regenerate
                      </Button>
                      {video.instagram.caption ? (
                        <Button variant="outline" size="sm" onClick={copyCaption}>
                          <Copy className="h-4 w-4" />
                          Copy caption
                        </Button>
                      ) : null}
                      {video.instagram.themeLabel ? <Badge variant="outline">{video.instagram.themeLabel}</Badge> : null}
                    </div>
                    {video.instagram.caption ? <p className="text-sm leading-6">{video.instagram.caption}</p> : null}
                    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
                      {video.instagram.slides.map((slide) => (
                        <figure key={slide.index} className="w-52 shrink-0 snap-start">
                          <img
                            src={`${slide.image}?v=${encodeURIComponent(video.instagram.generatedAt || "")}`}
                            alt={slide.headline || `Slide ${slide.index}`}
                            className="aspect-[4/5] w-full rounded-xl border border-border bg-muted object-cover"
                          />
                          <figcaption className="mt-2 space-y-1">
                            <p className="text-xs text-muted-foreground">Slide {slide.index}</p>
                            <p className="text-sm font-medium leading-5">{slide.headline}</p>
                            {slide.text ? <p className="text-xs leading-5 text-muted-foreground">{slide.text}</p> : null}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">No Instagram carousel yet. Pick a theme and turn this transcript into posts.</p>
                    <Button onClick={() => onGenerateInstagram?.(video)}>
                      <Images className="h-4 w-4" />
                      Create IG posts
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
