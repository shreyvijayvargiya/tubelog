import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Eye, Lightbulb, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { IdeaSheet } from "../components/IdeaSheet.jsx";
import { Badge, Button, Card, Input, Skeleton } from "../components/ui/button.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/tabs.jsx";
import { api, emitLibraryChange } from "../lib/api.js";
import { useActiveChannel } from "../lib/activeChannel.jsx";
import { formatPublished } from "../lib/utils.js";

const STATUS_LABEL = { new: "New", saved: "Saved", scripted: "Scripted", dismissed: "Dismissed" };

export function IdeasPage() {
  const { active, loading: channelsLoading, reload } = useActiveChannel();
  const slug = active?.slug || "";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("open");
  const [focus, setFocus] = useState("");
  const [running, setRunning] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [sheetId, setSheetId] = useState("");

  const load = useCallback(
    (pageNumber) => {
      if (!slug) return Promise.resolve();
      return api(`/api/channels/${slug}/ideas?page=${pageNumber}`)
        .then((result) => {
          setData(result);
          setError("");
        })
        .catch((err) => setError(err.message));
    },
    [slug],
  );

  useEffect(() => {
    setData(null);
    setPage(1);
    setSheetId("");
  }, [slug]);

  useEffect(() => {
    load(page);
  }, [load, page]);

  async function findIdeas() {
    setRunning(true);
    try {
      const body = { channel: slug };
      if (focus.trim()) body.focus = focus.trim();
      const result = await api("/api/ai/ideas", { method: "POST", body });
      const worked = result.run.sources.filter((source) => source.ok).length;
      toast.success(`Found ${result.ideas.length} new ideas from ${worked} research sources.`);
      setPage(1);
      await load(1);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function rebuild() {
    setRebuilding(true);
    try {
      const result = await api(`/api/my-channels/${slug}/memory`, { method: "POST", body: { sync: true } });
      toast.success(`Memory updated: ${result.memory.videos} videos${result.sync ? `, ${result.sync.saved} new imported` : ""}.`);
      emitLibraryChange();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRebuilding(false);
    }
  }

  async function setStatus(idea, status) {
    try {
      await api(`/api/channels/${slug}/ideas/${idea.id}`, { method: "PATCH", body: { status } });
      await load(page);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const rows = useMemo(() => {
    const ideas = data?.ideas || [];
    if (filter === "all") return ideas;
    if (filter === "open") return ideas.filter((idea) => idea.status !== "dismissed");
    return ideas.filter((idea) => idea.status === filter);
  }, [data, filter]);
  const runsById = useMemo(() => Object.fromEntries((data?.runs || []).map((run) => [run.id, run])), [data]);
  const lastRun = data?.runs?.[0];

  if (!channelsLoading && !active) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-2 py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border">
          <Lightbulb className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Find ideas for your channel</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Add your channel and TubeLog learns from your videos, researches what is trending, and suggests new topics.
        </p>
        <Button className="mt-6" asChild>
          <Link to="/my-channels/new">
            <Plus className="h-4 w-4" />
            Add my channel
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ideas</h1>
          <p className="text-sm text-muted-foreground">
            New topics for {active?.name || "your channel"}, from your own videos and fresh research.
            {active?.memory ? ` Memory: ${active.memory.videos} videos.` : " No memory yet."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={rebuild} disabled={rebuilding || running || !slug}>
          <RefreshCw className={`h-4 w-4 ${rebuilding ? "animate-spin" : ""}`} />
          {rebuilding ? "Updating…" : "Sync & update memory"}
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-sm"
            placeholder="Optional focus, e.g. voice agents"
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && !running && findIdeas()}
            disabled={running}
          />
          <Button onClick={findIdeas} disabled={running || !slug}>
            <Lightbulb className="h-4 w-4" />
            {running ? "Researching…" : "Find new ideas"}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open ideas</SelectItem>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="saved">Saved</SelectItem>
                <SelectItem value="scripted">Scripted</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {running ? (
          <p className="mt-3 text-sm text-muted-foreground">Reading your memory, searching news, Hacker News, trends and YouTube at once, then thinking. Usually under a minute.</p>
        ) : lastRun && page === 1 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>Last run {formatPublished(lastRun.at)}:</span>
            {lastRun.sources
              .filter((source) => !source.skipped)
              .map((source) => (
                <Badge key={source.source} variant="outline">
                  {source.source} {source.ok ? source.count : "failed"}
                </Badge>
              ))}
          </div>
        ) : null}
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Idea</th>
              <th className="px-3 py-2 font-medium">Format</th>
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Found</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">Sources</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data === null && !error
              ? Array.from({ length: 5 }, (_, index) => (
                  <tr key={index} className="border-b border-border last:border-0">
                    <td colSpan={7} className="px-3 py-3">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))
              : null}
            {data && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {data.ideas.length === 0 ? "No ideas yet. Choose Find new ideas." : "No ideas match this filter."}
                </td>
              </tr>
            ) : null}
            {rows.map((idea) => (
              <tr key={idea.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50" onClick={() => setSheetId(idea.id)}>
                <td className="max-w-md px-3 py-3">
                  <p className="truncate font-medium">{idea.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{idea.hook}</p>
                </td>
                <td className="px-3 py-3 capitalize text-muted-foreground">{idea.format}</td>
                <td className="px-3 py-3">
                  <Badge variant={idea.priority >= 4 ? "default" : "outline"}>P{idea.priority}</Badge>
                </td>
                <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{formatPublished(idea.createdAt)}</td>
                <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">{idea.sources?.length || 0}</td>
                <td className="px-3 py-3">
                  <Badge variant={idea.status === "new" ? "outline" : "secondary"}>{STATUS_LABEL[idea.status] || idea.status}</Badge>
                </td>
                <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" aria-label="View idea" onClick={() => setSheetId(idea.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {idea.status !== "dismissed" ? (
                      <Button variant="ghost" size="icon" aria-label="Dismiss idea" onClick={() => setStatus(idea, "dismissed")}>
                        <X className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" aria-label="Restore idea" onClick={() => setStatus(idea, "new")}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.page} of {data.pages}
            {data.page > 1 ? " · older runs" : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              <ChevronLeft className="h-4 w-4" /> Newer
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((current) => current + 1)}>
              Older <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <IdeaSheet
        slug={slug}
        channelName={active?.name || ""}
        ideaId={sheetId}
        open={Boolean(sheetId)}
        onOpenChange={(open) => !open && setSheetId("")}
        runs={runsById}
        onChanged={() => load(page)}
      />
    </div>
  );
}
