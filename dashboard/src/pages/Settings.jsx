import { Badge, Card } from "../components/ui/button.jsx";
import { useConfig } from "../lib/useConfig.js";

export function SettingsPage() {
  const { config, error } = useConfig();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">TubeLog settings</h1>
        <p className="text-sm text-muted-foreground">
          API keys should be stored in .env and are never saved in Markdown files.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card className="divide-y divide-border">
        <Row label="OpenRouter" value={config ? (config.openRouter.configured ? "Configured" : "Not configured") : "…"} />
        <Row label="Default model" value={config?.ai?.model || "…"} />
        <Row label="Default blog language" value={config?.blog?.language || "…"} />
        <Row label="Default blog style" value={config?.blog?.styles?.find((style) => style.id === config.blog.style)?.label || config?.blog?.style || "…"} />
        <Row label="Videos directory" value={config?.videosDir || "…"} />
        <Row label="GitHub" value={config?.github || "…"} />
      </Card>
      <Card className="space-y-2 p-4 text-sm text-muted-foreground">
        <p>The secret itself stays on the server. This page only shows whether a key is present.</p>
        <p>
          Create a key at{" "}
          <a className="underline underline-offset-4" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
            openrouter.ai/keys
          </a>{" "}
          and put it in <Badge variant="outline">.env</Badge> as <Badge variant="outline">OPENROUTER_API_KEY</Badge>. Restart TubeLog after changing it.
        </p>
      </Card>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="break-all text-sm font-medium">{value}</span>
    </div>
  );
}
