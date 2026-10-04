import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  Eye,
  FileText,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, emitLibraryChange } from "../lib/api.js";
import { cn, copyText, formatDuration, formatPublished } from "../lib/utils.js";
import { BlogDialog } from "./BlogDialog.jsx";
import { IgDialog } from "./IgDialog.jsx";
import { VideoSheet } from "./VideoSheet.jsx";
import { Badge, Button, Input, Skeleton } from "./ui/button.jsx";
import { Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog.jsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip, TooltipContent, TooltipTrigger } from "./ui/menu.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/tabs.jsx";

export function VideoTable({
  videos,
  loading = false,
  error = "",
  onReload,
  lockedChannel = "",
  hideFilters = false,
  limit = 0,
  initialQuery = "",
}) {
  const [query, setQuery] = useState(initialQuery);
  const [searchRows, setSearchRows] = useState(null);
  const [searching, setSearching] = useState(false);
  const [channel, setChannel] = useState(lockedChannel || "all");
  const [transcript, setTranscript] = useState("all");
  const [blog, setBlog] = useState("all");
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState([]);
  const [sheetId, setSheetId] = useState("");
  const [sheetTab, setSheetTab] = useState("overview");
  const [blogTargets, setBlogTargets] = useState([]);
  const [igTarget, setIgTarget] = useState(null);
  const [pendingDelete, setPendingDelete] = useState([]);

  useEffect(() => {
    setQuery(initialQuery || "");
  }, [initialQuery]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchRows(null);
      setSearching(false);
      return undefined;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q });
        const slug = lockedChannel || (channel !== "all" ? channel : "");
        if (slug) params.set("channel", slug);
        const data = await api(`/api/search?${params}`);
        setSearchRows(data.results);
      } catch (err) {
        toast.error(err.message);
        setSearchRows([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, channel, lockedChannel]);

  const channelOptions = useMemo(() => {
    const map = new Map();
    for (const video of videos || []) {
      if (video.channelSlug) map.set(video.channelSlug, video.channel || video.channelSlug);
    }
    return [...map.entries()];
  }, [videos]);

  const rows = useMemo(() => {
    let list = searchRows || videos || [];
    if (lockedChannel) list = list.filter((video) => video.channelSlug === lockedChannel);
    else if (channel !== "all") list = list.filter((video) => video.channelSlug === channel);
    if (transcript === "available") list = list.filter((video) => video.transcriptAvailable);
    if (transcript === "missing") list = list.filter((video) => !video.transcriptAvailable);
    if (blog === "generated") list = list.filter((video) => video.blogGenerated);
    if (blog === "missing") list = list.filter((video) => !video.blogGenerated);
    const sorted = [...list].sort((a, b) => {
      if (sort === "title") return String(a.title).localeCompare(String(b.title));
      if (sort === "oldest") return String(a.publishedAt).localeCompare(String(b.publishedAt));
      if (sort === "duration") return (b.duration || 0) - (a.duration || 0);
      return String(b.publishedAt || b.updatedAt || "").localeCompare(String(a.publishedAt || a.updatedAt || ""));
    });
    return limit ? sorted.slice(0, limit) : sorted;
  }, [searchRows, videos, lockedChannel, channel, transcript, blog, sort, limit]);

  const selectedRows = rows.filter((video) => selected.includes(video.id));
  const allChecked = rows.length > 0 && rows.every((video) => selected.includes(video.id));

  function toggle(id) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function openVideo(id, tab = "overview") {
    setSheetTab(tab);
    setSheetId(id);
  }

  async function remove(ids) {
    let count = 0;
    for (const id of ids) {
      try {
        await api(`/api/videos/${id}`, { method: "DELETE" });
        count += 1;
      } catch (err) {
        toast.error(err.message);
      }
    }
    if (count) {
      toast.success(count === 1 ? "Video deleted." : `${count} videos deleted.`);
      setSelected([]);
      emitLibraryChange();
      onReload?.();
    }
    setPendingDelete([]);
  }

  return (
    <div className="space-y-3">
      {hideFilters ? null : (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search transcripts and blogs"
            className="lg:max-w-xs"
          />
          {lockedChannel ? null : (
            <Filter value={channel} onChange={setChannel} placeholder="Channel">
              <SelectItem value="all">All channels</SelectItem>
              {channelOptions.map(([slug, name]) => (
                <SelectItem key={slug} value={slug}>
                  {name}
                </SelectItem>
              ))}
            </Filter>
          )}
          <Filter value={transcript} onChange={setTranscript} placeholder="Transcript">
            <SelectItem value="all">Any transcript</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
          </Filter>
          <Filter value={blog} onChange={setBlog} placeholder="Blog">
            <SelectItem value="all">Any blog</SelectItem>
            <SelectItem value="generated">Generated</SelectItem>
            <SelectItem value="missing">Not generated</SelectItem>
          </Filter>
          <Filter value={sort} onChange={setSort} placeholder="Sort">
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="title">Title</SelectItem>
            <SelectItem value="duration">Duration</SelectItem>
          </Filter>
          <Button variant="outline" className="lg:ml-auto" onClick={onReload} disabled={loading || searching}>
            <RefreshCw className={cn("h-4 w-4", loading || searching ? "animate-spin" : "")} />
            Refresh
          </Button>
        </div>
      )}

      {selectedRows.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/60 px-3 py-2 text-sm">
          <span className="font-medium">{selectedRows.length} selected</span>
          <Button size="sm" variant="secondary" onClick={() => setBlogTargets(selectedRows.map(({ id, title }) => ({ id, title })))}>
            Generate Blogs
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPendingDelete(selectedRows.map((video) => video.id))}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(checked) => setSelected(checked ? rows.map((video) => video.id) : [])}
                  aria-label="Select all"
                />
              </th>
              <th className="px-3 py-2 font-medium">Video</th>
              <th className="px-3 py-2 font-medium">Channel</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Published</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">Duration</th>
              <th className="px-3 py-2 font-medium">Transcript</th>
              <th className="px-3 py-2 font-medium">Blog</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }, (_, index) => (
                  <tr key={index} className="border-b border-border last:border-0">
                    <td colSpan={8} className="px-3 py-3">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))
              : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {searching ? "Searching…" : query.trim() ? "No videos match." : "No videos yet."}
                </td>
              </tr>
            ) : null}
            {!loading
              ? rows.map((video) => (
                  <tr
                    key={video.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50"
                    onClick={() => openVideo(video.id)}
                  >
                    <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                      <Checkbox checked={selected.includes(video.id)} onCheckedChange={() => toggle(video.id)} aria-label={`Select ${video.title}`} />
                    </td>
                    <td className="max-w-xs px-3 py-3">
                      <div className="flex items-center gap-3">
                        {video.thumbnail ? (
                          <img src={video.thumbnail} alt="" className="hidden h-10 w-16 rounded-sm object-cover sm:block" />
                        ) : null}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{video.title}</p>
                          {video.match?.excerpt ? <p className="truncate text-xs text-muted-foreground">{video.match.excerpt}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{video.channel}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{formatPublished(video.publishedAt)}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">{formatDuration(video.duration)}</td>
                    <td className="px-3 py-3">
                      {video.transcriptAvailable ? <Badge>Available</Badge> : <Badge variant="outline">Missing</Badge>}
                    </td>
                    <td className="px-3 py-3">
                      {video.blogGenerated ? <Badge>Generated</Badge> : <Badge variant="outline">Not generated</Badge>}
                    </td>
                    <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <IconButton label="View" onClick={() => openVideo(video.id)}>
                          <Eye className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="Generate Blog" onClick={() => setBlogTargets([{ id: video.id, title: video.title }])}>
                          <Sparkles className="h-4 w-4" />
                        </IconButton>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="More actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openVideo(video.id, "transcript")}>
                              <FileText className="h-4 w-4" /> View Transcript
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => window.open(video.url, "_blank", "noopener")}>
                              <ExternalLink className="h-4 w-4" /> Open YouTube
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setBlogTargets([{ id: video.id, title: video.title }])}>
                              <Sparkles className="h-4 w-4" /> Generate Blog
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setBlogTargets([{ id: video.id, title: video.title }])}>
                              <RefreshCw className="h-4 w-4" /> Regenerate Blog
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => copyText(video.url).then(() => toast.success("URL copied."))}
                            >
                              <Copy className="h-4 w-4" /> Copy URL
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => window.open(`/api/videos/${video.id}/markdown`, "_blank", "noopener")}>
                              <FileText className="h-4 w-4" /> Open Markdown
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setPendingDelete([video.id])}>
                              <Trash2 className="h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>

      <VideoSheet
        videoId={sheetId}
        open={Boolean(sheetId)}
        tab={sheetTab}
        onTabChange={setSheetTab}
        onOpenChange={(next) => {
          if (!next) setSheetId("");
        }}
        onGenerate={(video) => setBlogTargets([{ id: video.id, title: video.title }])}
        onGenerateInstagram={(video) => {
          setSheetTab("instagram");
          setIgTarget({ id: video.id, title: video.title });
        }}
      />
      <IgDialog
        video={igTarget}
        open={Boolean(igTarget)}
        onOpenChange={(next) => {
          if (!next) setIgTarget(null);
        }}
        onDone={() => setSheetTab("instagram")}
      />
      <BlogDialog
        videos={blogTargets}
        open={blogTargets.length > 0}
        onOpenChange={(next) => {
          if (!next) setBlogTargets([]);
        }}
        onDone={onReload}
      />
      <Dialog open={pendingDelete.length > 0} onOpenChange={(next) => !next && setPendingDelete([])}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete.length === 1 ? "video" : `${pendingDelete.length} videos`}?</DialogTitle>
            <DialogDescription>This removes the Markdown files from the local library.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingDelete([])}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => remove(pendingDelete)}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Filter({ value, onChange, placeholder, children }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="lg:w-40">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function IconButton({ label, children, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
