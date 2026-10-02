import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, emitLibraryChange } from "../lib/api.js";
import { useConfig } from "../lib/useConfig.js";
import { Button } from "./ui/button.jsx";
import { Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog.jsx";
import { Input, Label } from "./ui/button.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.jsx";

export function AddContentDialog({ open, onOpenChange, defaultTab = "channel", initialQuery = "" }) {
  const { config } = useConfig();
  const [tab, setTab] = useState(defaultTab);
  const [query, setQuery] = useState(initialQuery);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open) return;
    setTab(defaultTab);
    setQuery(initialQuery || "");
    setAi(Boolean(config?.ai?.enabled));
    setStatus("");
  }, [open, defaultTab, initialQuery, config?.ai?.enabled]);

  async function submit() {
    const value = query.trim();
    if (!value) {
      toast.error(tab === "channel" ? "Enter a channel URL or name." : "Enter a video URL or id.");
      return;
    }
    setBusy(true);
    setStatus(tab === "channel" ? "Syncing channel…" : "Fetching transcript…");
    try {
      if (tab === "channel") {
        const data = await api("/api/youtube/sync", {
          method: "POST",
          body: { channel: value, generateBlog: ai },
        });
        toast.success(`Synced ${data.channel?.name || "channel"}. Saved ${data.saved}. Already archived ${data.alreadyArchived}.`);
      } else {
        const data = await api("/api/youtube/transcript", {
          method: "POST",
          body: { video: value, generateBlog: ai },
        });
        toast.success(data.available === false ? `Saved ${data.title}. Transcript unavailable.` : `Transcript saved: ${data.title}`);
      }
      emitLibraryChange();
      onOpenChange(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add content</DialogTitle>
          <DialogDescription>
            Archives land in local Markdown. AI blogs run only when you ask for them.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="channel">YouTube Channel</TabsTrigger>
            <TabsTrigger value="video">YouTube Video</TabsTrigger>
          </TabsList>
          <TabsContent value="channel" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="channel-query">YouTube URL or channel name</Label>
              <Input
                id="channel-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="https://youtube.com/@fireship"
                disabled={busy}
              />
            </div>
          </TabsContent>
          <TabsContent value="video" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="video-query">YouTube video URL or ID</Label>
              <Input
                id="video-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="https://youtube.com/watch?v=abc123def45"
                disabled={busy}
              />
            </div>
          </TabsContent>
        </Tabs>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <Checkbox checked={ai} onCheckedChange={(checked) => setAi(checked === true)} disabled={busy} />
          {tab === "channel" ? "Generate AI blogs for new videos" : "Generate AI blog"}
        </label>
        {status ? <p className="mt-3 text-sm text-muted-foreground">{status}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Working…" : tab === "channel" ? "Add Channel" : "Add Video"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
