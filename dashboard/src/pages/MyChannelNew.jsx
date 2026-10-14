import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button, Card, Input, Label } from "../components/ui/button.jsx";
import { Checkbox } from "../components/ui/dialog.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/tabs.jsx";
import { api, emitLibraryChange } from "../lib/api.js";
import { useActiveChannel } from "../lib/activeChannel.jsx";
import { useConfig } from "../lib/useConfig.js";

const textareaClass =
  "flex min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MyChannelNewPage() {
  const navigate = useNavigate();
  const { setActive } = useActiveChannel();
  const { config } = useConfig();
  const [saved, setSaved] = useState([]);
  const [mode, setMode] = useState("url");
  const [url, setUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState("");
  const [goals, setGoals] = useState("");
  const [maxVideos, setMaxVideos] = useState(20);
  const [sync, setSync] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/channels")
      .then((data) => setSaved(data.channels || []))
      .catch(() => setSaved([]));
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (mode === "url" && !url.trim()) return toast.error("Paste your YouTube channel URL.");
    if (mode === "saved" && !slug) return toast.error("Pick a saved channel.");
    setBusy(true);
    try {
      const body = { description, audience, goals, maxVideos: Number(maxVideos) || 20, sync };
      if (mode === "url") body.url = url.trim();
      else body.channel = slug;
      const data = await api("/api/my-channels", { method: "POST", body });
      setActive(data.channel.slug);
      emitLibraryChange();
      toast.success(`${data.channel.name} added. ${data.memory?.videos ?? 0} videos in memory.`);
      for (const warning of data.warnings || []) toast.message(warning);
      navigate("/ideas");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Add my channel</h1>
        <p className="text-sm text-muted-foreground">
          TubeLog reads your videos and their transcripts, remembers what you cover, and uses that to find new ideas. You can add more than one channel.
        </p>
      </div>
      <Card className="p-4">
        <form className="space-y-4" onSubmit={submit}>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === "url" ? "default" : "outline"} onClick={() => setMode("url")} disabled={busy}>
              YouTube URL
            </Button>
            <Button type="button" size="sm" variant={mode === "saved" ? "default" : "outline"} onClick={() => setMode("saved")} disabled={busy || saved.length === 0}>
              Saved channel
            </Button>
          </div>
          {mode === "url" ? (
            <div className="space-y-2">
              <Label>Channel URL or @handle</Label>
              <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/@yourchannel" disabled={busy} />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Channel already in your library</Label>
              <Select value={slug} onValueChange={setSlug} disabled={busy}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a channel" />
                </SelectTrigger>
                <SelectContent>
                  {saved.map((channel) => (
                    <SelectItem key={channel.slug} value={channel.slug}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>What is your channel about?</Label>
            <textarea
              className={textareaClass}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="I teach indie developers how to build SaaS with Next.js, ship fast and market it. Practical, no hype."
              disabled={busy}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Audience (optional)</Label>
              <Input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Solo founders and junior devs" disabled={busy} />
            </div>
            <div className="space-y-2">
              <Label>Goals (optional)</Label>
              <Input value={goals} onChange={(event) => setGoals(event.target.value)} placeholder="Grow subscribers, sell templates" disabled={busy} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={sync} onCheckedChange={(checked) => setSync(checked === true)} disabled={busy} />
              Import videos and transcripts now
            </label>
            {sync ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Latest</span>
                <Input type="number" min={1} max={50} className="h-8 w-20" value={maxVideos} onChange={(event) => setMaxVideos(event.target.value)} disabled={busy} />
                <span>videos</span>
              </div>
            ) : null}
          </div>
          {busy ? <p className="text-sm text-muted-foreground">Importing videos, reading transcripts and building memory. This can take a few minutes.</p> : null}
          {!config?.openRouter?.configured ? (
            <p className="text-sm text-muted-foreground">Add OPENROUTER_API_KEY to .env for AI summaries and idea runs. Memory still builds without it.</p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add channel"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
