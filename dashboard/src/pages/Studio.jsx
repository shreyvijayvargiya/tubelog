import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Copy, Download, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Label } from "../components/ui/button.jsx";
import { Checkbox } from "../components/ui/dialog.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/tabs.jsx";
import { api } from "../lib/api.js";
import { copyText, formatPublished } from "../lib/utils.js";
import { useConfig } from "../lib/useConfig.js";

const textareaClass =
  "flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const DEFAULT_RESOLUTIONS = ["720p", "1080p"];
const DEFAULT_RATIOS = ["16:9", "9:16", "1:1"];
const STATUS_LABEL = { submitting: "Starting", pending: "Queued", in_progress: "Generating", completed: "Ready", failed: "Failed", interrupted: "Interrupted", cancelled: "Cancelled", expired: "Expired" };
const BUSY = new Set(["submitting", "pending", "in_progress"]);

function costText(model, duration) {
  if (!model) return "";
  if (model.perSecond) return `About $${(model.perSecond * Number(duration || 0)).toFixed(2)} for ${duration}s at $${model.perSecond}/second`;
  if (model.pricing && Object.keys(model.pricing).length) {
    return `Pricing from OpenRouter: ${Object.entries(model.pricing).map(([key, value]) => `${key.replace(/_/g, " ")} ${value}`).join(", ")}`;
  }
  return "Price varies by model. Check it on OpenRouter before generating.";
}

export function StudioPage() {
  const { config } = useConfig();
  const topRef = useRef(null);
  const [models, setModels] = useState([]);
  const [videos, setVideos] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [duration, setDuration] = useState("6");
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [refine, setRefine] = useState(false);
  const [refineModel, setRefineModel] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const current = useMemo(() => models.find((item) => item.id === model) || null, [models, model]);
  const maxSeconds = config?.studio?.maxSeconds || 12;

  const loadVideos = useCallback(
    () =>
      api("/api/studio/videos")
        .then((data) => setVideos(data.videos || []))
        .catch(() => setVideos((existing) => existing || [])),
    [],
  );

  useEffect(() => {
    api("/api/studio/models")
      .then((data) => {
        const list = data.models || [];
        setModels(list);
        setModel((existing) => existing || list[0]?.id || "");
      })
      .catch(() => {});
    loadVideos();
  }, [loadVideos]);

  // Pick sensible options whenever the model changes, using what the model says it supports.
  useEffect(() => {
    if (!current) return;
    if (current.durations?.length) setDuration((value) => (current.durations.includes(Number(value)) ? value : String(current.durations.find((item) => item <= maxSeconds) ?? current.durations[0])));
    if (current.resolutions?.length) setResolution((value) => (current.resolutions.includes(value) ? value : current.resolutions[0]));
    if (current.aspectRatios?.length) setAspectRatio((value) => (current.aspectRatios.includes(value) ? value : current.aspectRatios[0]));
  }, [current, maxSeconds]);

  const anyBusy = running || (videos || []).some((video) => BUSY.has(video.status));
  useEffect(() => {
    if (!anyBusy) return undefined;
    const timer = setInterval(loadVideos, 4000);
    return () => clearInterval(timer);
  }, [anyBusy, loadVideos]);

  useEffect(() => {
    if (!running) return undefined;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  async function generate() {
    if (prompt.trim().length < 10) return toast.error("Describe the video in at least a sentence.");
    if (!model) return toast.error("Choose a model.");
    const summary = `Generate a ${duration}s ${resolution} video with ${model}?\n\n${costText(current, duration)}\n\nThis spends OpenRouter credits.`;
    if (!window.confirm(summary)) return;
    setRunning(true);
    try {
      const body = { prompt, model, duration: Number(duration), resolution, aspectRatio, refine };
      if (refine && refineModel.trim()) body.refineModel = refineModel.trim();
      await api("/api/ai/video", { method: "POST", body });
      toast.success("Your video is ready.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRunning(false);
      loadVideos();
    }
  }

  async function remove(video) {
    if (!window.confirm("Delete this video and its file?")) return;
    try {
      await api(`/api/studio/videos/${video.id}`, { method: "DELETE" });
      loadVideos();
    } catch (error) {
      toast.error(error.message);
    }
  }

  function reuse(video) {
    setPrompt(video.prompt);
    if (video.model) setModel(video.model);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      <div ref={topRef}>
        <h1 className="text-xl font-semibold tracking-tight">Studio</h1>
        <p className="text-sm text-muted-foreground">Describe a video and generate it with an OpenRouter video model. Videos are saved on this machine.</p>
      </div>

      <Card className="p-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Prompt</Label>
            <textarea
              className={textareaClass}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={running}
              placeholder="Describe the shot: the subject, the setting, how the camera moves, the light and mood, and what happens from start to end. Example: a slow dolly shot through a rainy neon street at night, a lone cyclist crosses the frame, warm reflections on wet asphalt, cinematic 35mm look."
            />
            <p className="text-xs text-muted-foreground">{prompt.length} / 4000 characters. Clips are short, so describe one scene.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 lg:col-span-1">
              <Label>Model</Label>
              {models.length ? (
                <Select value={model} onValueChange={setModel} disabled={running}>
                  <SelectTrigger>
                    <SelectValue placeholder="Model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name || item.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="google/veo-3.1" disabled={running} />
              )}
            </div>
            <div className="space-y-2">
              <Label>Duration (seconds)</Label>
              {current?.durations?.length ? (
                <Select value={duration} onValueChange={setDuration} disabled={running}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {current.durations.map((item) => (
                      <SelectItem key={item} value={String(item)}>
                        {item}s
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input type="number" min={1} max={maxSeconds} value={duration} onChange={(event) => setDuration(event.target.value)} disabled={running} />
              )}
            </div>
            <div className="space-y-2">
              <Label>Resolution</Label>
              <Select value={resolution} onValueChange={setResolution} disabled={running}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(current?.resolutions?.length ? current.resolutions : DEFAULT_RESOLUTIONS).map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Aspect ratio</Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio} disabled={running}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(current?.aspectRatios?.length ? current.aspectRatios : DEFAULT_RATIOS).map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={refine} onCheckedChange={(checked) => setRefine(checked === true)} disabled={running} />
              Improve my prompt with an AI model first
            </label>
            {refine ? (
              <div className="space-y-1">
                <Input value={refineModel} onChange={(event) => setRefineModel(event.target.value)} placeholder={`Prompt model, e.g. an Opus or Claude id. Empty uses ${config?.ai?.model || "the free default"}`} disabled={running} />
                <p className="text-xs text-muted-foreground">The model rewrites your idea as a detailed video prompt. You can see the improved prompt on the finished video.</p>
              </div>
            ) : null}
          </div>

          {!config?.openRouter?.configured ? <p className="text-sm text-muted-foreground">Add OPENROUTER_API_KEY to .env before generating.</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={generate} disabled={running || !prompt.trim()}>
              <Clapperboard className="h-4 w-4" />
              {running ? `Generating… ${elapsed}s` : "Generate video"}
            </Button>
            <span className="text-xs text-muted-foreground">{costText(current, duration)}</span>
          </div>
          {running ? <p className="text-sm text-muted-foreground">Video models take a few minutes. You can leave this page open and keep working. The video appears below when it is ready.</p> : null}
        </div>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Your videos</h2>
        {videos === null ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {videos && videos.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here yet. Write a prompt above and choose Generate video.</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(videos || []).map((video) => (
            <Card key={video.id} className="overflow-hidden">
              {video.file ? (
                <video controls preload="metadata" className="w-full bg-black" style={{ aspectRatio: String(video.aspectRatio || "16:9").replace(":", " / ") }} src={video.file} />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-muted px-4 text-center text-sm text-muted-foreground">
                  {BUSY.has(video.status) ? `${STATUS_LABEL[video.status] || video.status}…` : video.error || STATUS_LABEL[video.status] || video.status}
                </div>
              )}
              <div className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={video.status === "completed" ? "default" : "outline"}>{STATUS_LABEL[video.status] || video.status}</Badge>
                  <Badge variant="outline">{video.model}</Badge>
                  <Badge variant="outline">
                    {video.duration}s · {video.resolution}
                  </Badge>
                </div>
                <p className="line-clamp-3 text-sm leading-5">{video.prompt}</p>
                {video.finalPrompt ? (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">AI-improved prompt</summary>
                    <p className="mt-1 leading-5">{video.finalPrompt}</p>
                  </details>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {formatPublished(video.createdAt)}
                  {video.cost != null ? ` · $${Number(video.cost).toFixed(2)}` : ""}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button variant="outline" size="sm" onClick={() => reuse(video)}>
                    <RotateCcw className="h-4 w-4" />
                    Reuse prompt
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Copy prompt" onClick={() => copyText(video.finalPrompt || video.prompt).then(() => toast.success("Prompt copied."))}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  {video.file ? (
                    <Button variant="ghost" size="icon" aria-label="Download" asChild>
                      <a href={video.file} download={`${video.id}.mp4`}>
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : null}
                  {BUSY.has(video.status) ? null : (
                    <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(video)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
