import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, emitLibraryChange } from "../lib/api.js";
import { useConfig } from "../lib/useConfig.js";
import { Button, Label } from "./ui/button.jsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/tabs.jsx";

export function IgDialog({ video, open, onOpenChange, onDone }) {
  const { config } = useConfig();
  const [theme, setTheme] = useState("hook");
  const [model, setModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !config) return;
    const models = config.ai?.models || [];
    const free = models.find((item) => item.free);
    setModel(free?.id || config.ai?.model || "");
    setImageModel(config.instagram?.imageModel || config.instagram?.imageModels?.[0]?.id || "");
    setTheme(config.instagram?.themes?.[0]?.id || "hook");
  }, [open, config]);

  async function generate() {
    if (!video?.id) return;
    setBusy(true);
    try {
      await api("/api/ai/instagram", {
        method: "POST",
        body: { video: video.id, theme, model, imageModel },
      });
      toast.success("Instagram carousel created.");
      emitLibraryChange();
      onDone?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  const themes = config?.instagram?.themes || [];
  const models = (config?.ai?.models || []).map((item) =>
    typeof item === "string" ? { id: item, label: item, free: item.endsWith(":free") } : item,
  );
  const imageModels = config?.instagram?.imageModels || [];
  const selectedTheme = themes.find((item) => item.id === theme);

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create IG posts</DialogTitle>
          <DialogDescription>
            Turns the saved transcript into a carousel. A FREE text model writes the slides. Google Nano Banana draws each image.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Theme">
            <Select value={theme} onValueChange={setTheme} disabled={busy}>
              <SelectTrigger>
                <SelectValue placeholder="Theme" />
              </SelectTrigger>
              <SelectContent>
                {themes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTheme?.hook ? <p className="text-xs leading-5 text-muted-foreground">{selectedTheme.hook}</p> : null}
          </Field>
          <Field label="Slide copy">
            <Select value={model} onValueChange={setModel} disabled={busy}>
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
            <p className="text-xs leading-5 text-muted-foreground">FREE models write the words and do not spend OpenRouter credits.</p>
          </Field>
          <Field label="Images">
            <Select value={imageModel} onValueChange={setImageModel} disabled={busy}>
              <SelectTrigger>
                <SelectValue placeholder="Image model" />
              </SelectTrigger>
              <SelectContent>
                {imageModels.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              Nano Banana draws one portrait image per slide and uses OpenRouter credits. A carousel is six images.
            </p>
          </Field>
          {busy ? <p className="text-sm text-muted-foreground">Writing the slides, then drawing each image. This usually takes a few minutes.</p> : null}
          {!config?.openRouter?.configured ? (
            <p className="text-sm text-muted-foreground">Add OPENROUTER_API_KEY to .env before creating posts.</p>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={generate} disabled={busy || !video?.id}>
            {busy ? "Creating…" : "Create carousel"}
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
