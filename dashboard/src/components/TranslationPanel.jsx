import { useEffect, useState } from "react";
import { Download, Languages } from "lucide-react";
import { toast } from "sonner";
import { api, emitLibraryChange } from "../lib/api.js";
import { useConfig } from "../lib/useConfig.js";
import { Badge, Button, Input, Label } from "./ui/button.jsx";
import { Checkbox } from "./ui/dialog.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/tabs.jsx";

export function TranslationPanel({ video }) {
  const { config } = useConfig();
  const settings = config?.translation || {};
  const languages = settings.languages || [];
  const voices = settings.voices || [];
  const [language, setLanguage] = useState("");
  const [voice, setVoice] = useState("");
  const [dub, setDub] = useState(true);
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!config) return;
    setLanguage((current) => current || languages[0] || "");
    setVoice((current) => current || settings.voice || voices[0] || "");
  }, [config]);

  async function translate() {
    if (!video?.id || !language) return;
    setBusy(true);
    try {
      const body = { video: video.id, language, voice, replaceAudio: dub };
      if (dub && videoUrl.trim()) body.videoUrl = videoUrl.trim();
      const data = await api("/api/ai/translate", { method: "POST", body });
      if (data.translation?.videoSkipped) toast.message("Audio created. " + data.translation.videoSkipped);
      else toast.success(`${language} audio created.`);
      emitLibraryChange();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  const translations = video?.translations || [];

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border border-border p-4">
        <p className="text-sm leading-6 text-muted-foreground">
          Translates the saved transcript with AI, speaks it in the new language, and saves the audio next to the transcript. Optionally
          replaces the audio in a local copy of the video with ffmpeg.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage} disabled={busy}>
              <SelectTrigger>
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                {languages.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Voice</Label>
            <Select value={voice} onValueChange={setVoice} disabled={busy}>
              <SelectTrigger>
                <SelectValue placeholder="Voice" />
              </SelectTrigger>
              <SelectContent>
                {voices.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={dub} onCheckedChange={(checked) => setDub(checked === true)} disabled={busy} />
          Also replace the audio in the video file
        </label>
        {dub ? (
          <div className="space-y-2">
            <Label>Video file URL (optional)</Label>
            <Input
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="https://…/video.mp4, only needed if no local video exists"
              disabled={busy}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              TubeLog looks for videos/{video?.channelSlug || "channel"}/{video?.id || "video-id"}.mp4 first. A direct file URL is downloaded to that
              path.
            </p>
          </div>
        ) : null}
        {busy ? <p className="text-sm text-muted-foreground">Translating, speaking, then mixing. This can take a few minutes.</p> : null}
        {!config?.openRouter?.configured ? (
          <p className="text-sm text-muted-foreground">Add OPENROUTER_API_KEY to .env before translating.</p>
        ) : null}
        <Button onClick={translate} disabled={busy || !language || !video?.transcriptAvailable}>
          <Languages className="h-4 w-4" />
          {busy ? "Working…" : translations.length ? "Translate again" : "Create translation"}
        </Button>
        {!video?.transcriptAvailable ? <p className="text-xs text-muted-foreground">This video has no transcript to translate.</p> : null}
      </div>

      {translations.map((item) => (
        <div key={item.key} className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{item.language}</p>
            {item.voice ? <Badge variant="outline">{item.voice}</Badge> : null}
            {item.truncated ? <Badge variant="outline">Trimmed to the first {item.characters} characters</Badge> : null}
          </div>
          <audio controls preload="none" className="w-full" src={`${item.audio}?v=${encodeURIComponent(item.generatedAt)}`} />
          {item.video ? (
            <video
              controls
              preload="metadata"
              className="aspect-video w-full rounded-xl bg-black"
              src={`${item.video}?v=${encodeURIComponent(item.generatedAt)}`}
            />
          ) : item.videoSkipped ? (
            <p className="text-xs leading-5 text-muted-foreground">{item.videoSkipped}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={item.audio} download={`${video?.id}.${item.key}.mp3`}>
                <Download className="h-4 w-4" />
                Audio
              </a>
            </Button>
            {item.video ? (
              <Button variant="outline" size="sm" asChild>
                <a href={item.video} download={`${video?.id}.${item.key}.mp4`}>
                  <Download className="h-4 w-4" />
                  Video
                </a>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <a href={item.text} target="_blank" rel="noreferrer">
                Text
              </a>
            </Button>
          </div>
          {item.folder ? <p className="break-all text-xs text-muted-foreground">{item.folder}/{item.key}.*</p> : null}
        </div>
      ))}
    </div>
  );
}
