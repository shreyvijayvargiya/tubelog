import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/button.jsx";
import { MarkdownView, slugifyHeading } from "../components/MarkdownView.jsx";
import raw from "../data/docs.md?raw";

// The docs live in dashboard/src/data/docs.md: a frontmatter block, then Markdown.
function parseDocs(source) {
  const match = String(source).match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  if (match) {
    for (const line of match[1].split("\n")) {
      const index = line.indexOf(":");
      if (index > 0) meta[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^"|"$/g, "");
    }
  }
  const body = (match ? match[2] : String(source)).trim();
  const headings = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    const heading = !fenced && line.match(/^##\s+(.+)$/);
    if (heading) headings.push({ title: heading[1].trim(), id: slugifyHeading(heading[1]) });
  }
  return { meta, body, headings };
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function jumpTo(id) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState(null, "", `#${id}`);
}

export function DocsPage() {
  const { meta, body, headings } = useMemo(() => parseDocs(raw), []);
  const [active, setActive] = useState("");
  const [bannerOk, setBannerOk] = useState(true);
  const tags = String(meta.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);

  useEffect(() => {
    if (window.location.hash) setTimeout(() => jumpTo(decodeURIComponent(window.location.hash.slice(1))), 100);
  }, []);

  useEffect(() => {
    const elements = headings.map((heading) => document.getElementById(heading.id)).filter(Boolean);
    if (!elements.length || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [headings]);

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <nav className="sticky top-4 max-h-[calc(100vh-6rem)] space-y-0.5 overflow-y-auto pr-2 text-sm" aria-label="On this page">
          <p className="px-2 pb-2 text-xs font-medium tracking-wide text-muted-foreground">ON THIS PAGE</p>
          {headings.map((heading) => (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              onClick={(event) => {
                event.preventDefault();
                jumpTo(heading.id);
              }}
              className={`block rounded-md px-2 py-1.5 ${active === heading.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              {heading.title}
            </a>
          ))}
        </nav>
      </aside>
      <article className="min-w-0 max-w-3xl">
        {meta.bannerImage && bannerOk ? (
          <img src={meta.bannerImage} alt="" className="mb-6 aspect-[2/1] w-full rounded-xl border border-border object-cover" onError={() => setBannerOk(false)} />
        ) : null}
        <p className="text-xs font-medium tracking-wide text-muted-foreground">DOCS</p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{meta.title}</h1>
        {meta.description ? <p className="mt-3 text-base leading-7 text-muted-foreground">{meta.description}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {meta.author ? <span>{meta.author}</span> : null}
          {meta.publishedAt ? <span>· {formatDate(meta.publishedAt)}</span> : null}
          {tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
        <div className="mt-8">
          <MarkdownView headingIds>{body}</MarkdownView>
        </div>
      </article>
    </div>
  );
}
