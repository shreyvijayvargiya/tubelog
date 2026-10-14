import { useCallback, useEffect, useState } from "react";
import { Bookmark, Copy, ExternalLink, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api.js";
import { copyText, formatPublished } from "../lib/utils.js";
import { MarkdownView } from "./MarkdownView.jsx";
import { Badge, Button, Input, Label, Separator, Skeleton } from "./ui/button.jsx";
import { Checkbox, DialogTitle, Sheet, SheetContent } from "./ui/dialog.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.jsx";

const STATUS_LABEL = { new: "New", saved: "Saved", scripted: "Scripted", dismissed: "Dismissed" };

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function Chips({ items }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant="outline">
          {item}
        </Badge>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  if (!children) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm leading-6">{children}</div>
    </div>
  );
}

export function IdeaSheet({ slug, channelName, ideaId, open, onOpenChange, runs = {}, onChanged }) {
  const [idea, setIdea] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState({ script: true, assets: true, images: false, music: true, minutes: 8 });

  const load = useCallback(() => {
    if (!slug || !ideaId) return Promise.resolve();
    return api(`/api/channels/${slug}/ideas/${ideaId}`)
      .then((data) => {
        setIdea(data.idea);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [slug, ideaId]);

  useEffect(() => {
    if (!open) return;
    setIdea(null);
    setTab("overview");
    setPanel(false);
    load();
  }, [open, load]);

  async function setStatus(status) {
    try {
      const data = await api(`/api/channels/${slug}/ideas/${ideaId}`, { method: "PATCH", body: { status } });
      setIdea(data.idea);
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function produce() {
    setBusy(true);
    try {
      const data = await api(`/api/channels/${slug}/ideas/${ideaId}/produce`, {
        method: "POST",
        body: { script: opts.script, assets: opts.assets, images: opts.images, music: opts.music, minutes: Number(opts.minutes) || 8 },
      });
      setIdea(data.idea);
      setPanel(false);
      const failed = Object.entries(data.errors || {});
      toast.success("Generated.");
      for (const [name, message] of failed) toast.message(`${name}: ${message}`);
      setTab(opts.script ? "script" : opts.assets ? "assets" : "music");
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const copy = (text, label) => copyText(text).then(() => toast.success(`${label} copied.`));
  const run = idea ? runs[idea.runId] : null;
  const generate = (
    <Button size="sm" onClick={() => setPanel((current) => !current)} disabled={!idea}>
      <Sparkles className="h-4 w-4" />
      Generate script & assets
    </Button>
  );
  const empty = (text) => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button onClick={() => setPanel(true)}>
        <Sparkles className="h-4 w-4" />
        Generate
      </Button>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{channelName || "Idea"}</p>
            <DialogTitle className="mt-1 text-lg font-semibold leading-snug tracking-tight">{idea?.title || "Idea"}</DialogTitle>
            {idea ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={idea.priority >= 4 ? "default" : "outline"}>Priority {idea.priority}</Badge>
                <Badge variant="outline" className="capitalize">
                  {idea.format}
                </Badge>
                <Badge variant={idea.status === "new" ? "outline" : "secondary"}>{STATUS_LABEL[idea.status] || idea.status}</Badge>
                <span>Found {formatPublished(idea.createdAt)}</span>
              </div>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
          {generate}
          {idea?.status === "scripted" ? null : (
            <Button size="sm" variant="outline" disabled={!idea} onClick={() => setStatus(idea?.status === "saved" ? "new" : "saved")}>
              <Bookmark className="h-4 w-4" />
              {idea?.status === "saved" ? "Unsave" : "Save idea"}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={!idea} onClick={() => setStatus(idea?.status === "dismissed" ? "new" : "dismissed")}>
            {idea?.status === "dismissed" ? "Restore" : "Dismiss"}
          </Button>
        </div>
        {panel ? (
          <div className="space-y-3 border-b border-border bg-muted/40 px-5 py-4">
            <p className="text-sm text-muted-foreground">The research agent only suggested this idea. These write the production material from it.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["script", "Script"],
                ["assets", "Assets: thumbnails and shot list"],
                ["images", "Draw thumbnail images (uses OpenRouter credits)"],
                ["music", "Background music brief"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={opts[key]} onCheckedChange={(checked) => setOpts((current) => ({ ...current, [key]: checked === true }))} disabled={busy || (key === "images" && !opts.assets)} />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Label>Length</Label>
                <Input type="number" min={1} max={30} className="h-8 w-20" value={opts.minutes} onChange={(event) => setOpts((current) => ({ ...current, minutes: event.target.value }))} disabled={busy} />
                <span>min</span>
              </div>
              <Button size="sm" onClick={produce} disabled={busy || (!opts.script && !opts.assets && !opts.music)}>
                {busy ? "Generating…" : "Generate"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPanel(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
            {busy ? <p className="text-xs text-muted-foreground">Writing everything at once. This can take a minute or two.</p> : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!idea && !error ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {idea ? (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="script">Script</TabsTrigger>
                <TabsTrigger value="assets">Assets</TabsTrigger>
                <TabsTrigger value="music">Music</TabsTrigger>
                <TabsTrigger value="sources">Sources ({idea.sources?.length || 0})</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Field label="Hook">{idea.hook}</Field>
                <Field label="Angle">{idea.angle}</Field>
                <Field label="Why now">{idea.whyNow}</Field>
                <Field label="Audience">{idea.audience}</Field>
                {idea.titleOptions?.length ? (
                  <Field label="Title options">
                    <ul className="space-y-1">
                      {[idea.title, ...idea.titleOptions].map((title) => (
                        <li key={title} className="flex items-center justify-between gap-2">
                          <span>{title}</span>
                          <Button variant="ghost" size="icon" aria-label="Copy title" onClick={() => copy(title, "Title")}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </Field>
                ) : null}
                {idea.keywords?.length ? (
                  <Field label="Keywords">
                    <Chips items={idea.keywords} />
                  </Field>
                ) : null}
              </TabsContent>

              <TabsContent value="script">
                {idea.script?.markdown ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => copy(idea.script.markdown, "Script")}>
                        <Copy className="h-4 w-4" />
                        Copy script
                      </Button>
                      <span className="text-xs text-muted-foreground">Generated {formatPublished(idea.script.generatedAt)}</span>
                    </div>
                    <MarkdownView>{idea.script.markdown}</MarkdownView>
                  </div>
                ) : (
                  empty("No script yet. The agent only researches; generate one when you want to make this video.")
                )}
              </TabsContent>

              <TabsContent value="assets">
                {idea.assets ? (
                  <div className="space-y-5">
                    {idea.assets.images?.length ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {idea.assets.images.map((image) => (
                          <figure key={image.name} className="space-y-1">
                            <img src={image.url} alt={image.concept} className="aspect-video w-full rounded-lg border border-border object-cover" />
                            <figcaption className="text-xs text-muted-foreground">{image.concept}</figcaption>
                          </figure>
                        ))}
                      </div>
                    ) : null}
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Thumbnail concepts</p>
                      {(idea.assets.thumbnails || []).map((thumb, index) => (
                        <div key={index} className="space-y-1 rounded-lg border border-border p-3 text-sm">
                          <p className="font-medium">{thumb.concept}</p>
                          {thumb.textOverlay ? <p className="text-xs text-muted-foreground">Text: {thumb.textOverlay}</p> : null}
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs leading-5 text-muted-foreground">{thumb.prompt}</p>
                            <Button variant="ghost" size="icon" aria-label="Copy prompt" onClick={() => copy(thumb.prompt, "Prompt")}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Shot list</p>
                      <ul className="space-y-2 text-sm">
                        {(idea.assets.shots || []).map((shot, index) => (
                          <li key={index} className="rounded-lg border border-border p-3">
                            <p className="text-xs text-muted-foreground">{shot.section}</p>
                            <p>{shot.visual}</p>
                            {shot.note ? <p className="text-xs text-muted-foreground">{shot.note}</p> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  empty("No assets yet. Generate thumbnail concepts, optional images and a shot list.")
                )}
              </TabsContent>

              <TabsContent value="music">
                {idea.music ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge>{idea.music.mood}</Badge>
                      <Badge variant="outline">{idea.music.bpm} BPM</Badge>
                      <Badge variant="outline" className="capitalize">
                        {idea.music.energy} energy
                      </Badge>
                    </div>
                    <Field label="Instruments">
                      <Chips items={idea.music.instruments} />
                    </Field>
                    <Field label="Structure">
                      <ul className="space-y-1">
                        {(idea.music.structure || []).map((part, index) => (
                          <li key={index}>
                            <span className="font-medium capitalize">{part.part}</span> · {part.seconds}s · {part.description}
                          </li>
                        ))}
                      </ul>
                    </Field>
                    <Field label="Search terms">
                      <Chips items={idea.music.searchTerms} />
                    </Field>
                    <Field label="Find royalty-free tracks">
                      <ul className="space-y-1">
                        {(idea.music.libraries || []).map((library) => (
                          <li key={library.url}>
                            <a className="inline-flex items-center gap-1 underline" href={library.url} target="_blank" rel="noreferrer">
                              {library.name} <ExternalLink className="h-3 w-3" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </Field>
                    <p className="text-xs text-muted-foreground">This is a brief for finding or commissioning music. TubeLog does not generate audio tracks.</p>
                  </div>
                ) : (
                  empty("No music brief yet. Generate a mood, tempo and search terms for royalty-free libraries.")
                )}
              </TabsContent>

              <TabsContent value="sources" className="space-y-4">
                {idea.sources?.length ? (
                  <ul className="space-y-3">
                    {idea.sources.map((source, index) => (
                      <li key={`${source.url}-${index}`} className="space-y-1 rounded-lg border border-border p-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">S{index + 1}</Badge>
                          <Badge variant="secondary">{source.type}</Badge>
                          {source.date ? <span className="text-xs text-muted-foreground">{source.date}</span> : null}
                        </div>
                        <a className="inline-flex items-start gap-1 font-medium underline" href={source.url} target="_blank" rel="noreferrer">
                          <span>{source.title}</span>
                          <ExternalLink className="mt-1 h-3 w-3 shrink-0" />
                        </a>
                        {source.snippet ? <p className="text-xs leading-5 text-muted-foreground">{source.snippet}</p> : null}
                        <p className="text-xs text-muted-foreground">{hostOf(source.url)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No outside sources. This idea comes from the patterns in your own videos.</p>
                )}
                {run ? (
                  <>
                    <Separator />
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <p>
                        Found in a run on {formatPublished(run.at)} with {run.model}
                        {run.focus ? `, focus “${run.focus}”` : ""}.
                      </p>
                      <p>Searched: {(run.queries || []).join(", ")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(run.sources || [])
                          .filter((source) => !source.skipped)
                          .map((source) => (
                            <Badge key={source.source} variant="outline">
                              {source.source} {source.ok ? source.count : "failed"}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
