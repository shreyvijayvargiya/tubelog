import { Card } from "../components/ui/button.jsx";
import { CHANGELOG } from "../data/changelog.js";

function formatDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Changelog</h1>
        <p className="text-sm text-muted-foreground">What's new in TubeLog.</p>
      </div>
      <div className="space-y-6">
        {CHANGELOG.map((entry) => (
          <Card key={`${entry.date}-${entry.title}`} className="overflow-hidden">
            <div className="space-y-1 px-4 pb-3 pt-4">
              <p className="text-xs text-muted-foreground">{formatDate(entry.date)}</p>
              <h2 className="text-base font-semibold tracking-tight">{entry.title}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{entry.description}</p>
            </div>
            {entry.video ? (
              <video controls preload="metadata" className="aspect-video w-full bg-black" src={entry.video}>
                <a href={entry.video} target="_blank" rel="noreferrer">
                  Watch the video
                </a>
              </video>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
