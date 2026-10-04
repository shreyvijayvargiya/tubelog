import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, emitLibraryChange } from "../lib/api.js";
import { useConfig } from "../lib/useConfig.js";
import { Button, Input, Label } from "./ui/button.jsx";
import { Checkbox, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/tabs.jsx";

export function BlogDialog({ videos = [], open, onOpenChange, onDone }) {
  const { config } = useConfig();
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [style, setStyle] = useState("educational");
  const [language, setLanguage] = useState("English");
  const [takeaways, setTakeaways] = useState(true);
  const [original, setOriginal] = useState(true);
  const [code, setCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (!open || !config) return;
    setModel(config.ai.model);
    setCustomModel("");
    setStyle(config.blog.style || "educational");
    setLanguage(config.blog.language || "English");
    setTakeaways(true);
    setOriginal(true);
    setCode(false);
    setProgress("");
  }, [open, config]);

  async function generate() {
    if (!videos.length) return;
    setBusy(true);
    let done = 0;
    for (let index = 0; index < videos.length; index += 1) {
      const video = videos[index];
      setProgress(videos.length > 1 ? `Generating ${index + 1}/${videos.length}: ${video.title}` : "Generating blog…");
      try {
        await api("/api/ai/blog", {
          method: "POST",
          body: {
            video: video.id,
            model: customModel.trim() || model,
            style,
            language,
            includeTakeaways: takeaways,
            includeOriginalVideo: original,
            includeCodeExamples: code,
          },
        });
        done += 1;
      } catch (error) {
        toast.error(`${video.title}: ${error.message}`);
      }
    }
    setBusy(false);
    setProgress("");
    if (done) {
      toast.success(done === 1 ? "Blog generated successfully." : `${done} blogs generated.`);
      emitLibraryChange();
      onDone?.();
      onOpenChange(false);
    }
  }

  const styles = config?.blog?.styles || [];
  const models = (config?.ai?.models || []).map((item) =>
    typeof item === "string" ? { id: item, label: item, free: item.endsWith(":free") } : item,
  );
  const languages = config?.blog?.languages || ["English"];
  const selected = models.find((item) => item.id === model) || models[0];

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate AI Blog</DialogTitle>
          <DialogDescription>
            {videos.length > 1
              ? `Writes blogs one at a time for ${videos.length} videos.`
              : "Turns the saved transcript into a readable lesson."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Model">
            <Select
              value={model || selected?.id || "google/gemma-4-31b-it:free"}
              onValueChange={(value) => {
                setModel(value);
                setCustomModel("");
              }}
              disabled={busy}
            >
              <SelectTrigger>
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.free ? `${item.label} · FREE` : item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              FREE models do not spend OpenRouter credits. You still need an API key.
            </p>
            <Input
              value={customModel}
              onChange={(event) => setCustomModel(event.target.value)}
              placeholder="Custom model id, such as provider/model:free"
              disabled={busy}
              aria-label="Custom model"
            />
          </Field>
          <Field label="Style">
            <Select value={style} onValueChange={setStyle} disabled={busy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {styles.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Language">
            <Select value={language} onValueChange={setLanguage} disabled={busy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="space-y-2 text-sm">
            <CheckRow checked={takeaways} onChange={setTakeaways} disabled={busy} label="Include key takeaways" />
            <CheckRow checked={original} onChange={setOriginal} disabled={busy} label="Include original video" />
            <CheckRow checked={code} onChange={setCode} disabled={busy} label="Include code examples" />
          </div>
          {progress ? <p className="text-sm text-muted-foreground">{progress}</p> : null}
          {!config?.openRouter?.configured ? (
            <p className="text-sm text-muted-foreground">Add OPENROUTER_API_KEY to .env before generating.</p>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={generate} disabled={busy || !videos.length}>
            {busy ? "Generating…" : "Generate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function CheckRow({ checked, onChange, disabled, label }) {
  return (
    <label className="flex items-center gap-2">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} disabled={disabled} />
      {label}
    </label>
  );
}
