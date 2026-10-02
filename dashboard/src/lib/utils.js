import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "—";
  const rounded = Math.round(total);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remain = rounded % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

export function formatPublished(value) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      const sameYear = date.getFullYear() === new Date().getFullYear();
      return date.toLocaleDateString("en-US", sameYear
        ? { month: "short", day: "numeric" }
        : { month: "short", day: "numeric", year: "numeric" });
    }
  }
  return value;
}

export function formatStamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export async function copyText(value) {
  await navigator.clipboard.writeText(String(value || ""));
}

const LINK_LINE = /^(?:[►▶▸•*-]+\s*)?(.+?):\s*(https?:\/\/\S+)\s*$/;
const HASHTAGS = /^#[^\s]+(?:\s+#[^\s]+)*$/;

function normalizePlain(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
}

function linkParts(raw) {
  const match = String(raw || "").match(/^(https?:\/\/\S+?)[)\].,;:!?]*$/);
  return match ? match[1] : String(raw || "");
}

function escapeLinkLabel(text) {
  return String(text || "")
    .replace(/^[►▶▸•*-]+\s*/, "")
    .trim()
    .replace(/[[\]\\]/g, "\\$&");
}

function isLinkLine(line) {
  return LINK_LINE.test(line);
}

function isSectionLabel(line) {
  return line.endsWith(":") && line.length < 90 && !/https?:\/\//.test(line);
}

function chunkSentences(text, size) {
  const sentences = String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length <= 1) return sentences.length ? [sentences.join(" ")] : [];
  const paragraphs = [];
  let bucket = [];
  for (const sentence of sentences) {
    bucket.push(sentence);
    if (bucket.length >= size) {
      paragraphs.push(bucket.join(" "));
      bucket = [];
    }
  }
  if (bucket.length) paragraphs.push(bucket.join(" "));
  return paragraphs;
}

export function proseToMarkdown(text) {
  const lines = normalizePlain(text).split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (/^[►▶▸]/.test(line) && !isLinkLine(line)) {
      index += 1;
      continue;
    }

    if (HASHTAGS.test(line)) {
      blocks.push(line.replace(/#/g, "\\#"));
      index += 1;
      continue;
    }

    if (isLinkLine(line)) {
      const items = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        if (!current) {
          let look = index + 1;
          while (look < lines.length && !lines[look].trim()) look += 1;
          if (look < lines.length && isLinkLine(lines[look].trim())) {
            index = look;
            continue;
          }
          break;
        }
        if (!isLinkLine(current)) break;
        const match = current.match(LINK_LINE);
        items.push(`- [${escapeLinkLabel(match[1])}](${linkParts(match[2])})`);
        index += 1;
      }
      if (items.length) blocks.push(items.join("\n"));
      continue;
    }

    if (isSectionLabel(line)) {
      let look = index + 1;
      while (look < lines.length && !lines[look].trim()) look += 1;
      if (look < lines.length && isLinkLine(lines[look].trim())) {
        blocks.push(`**${escapeLinkLabel(line.replace(/:$/, ""))}**`);
        index += 1;
        continue;
      }
    }

    const prose = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || HASHTAGS.test(next) || isLinkLine(next) || isSectionLabel(next)) break;
      prose.push(next);
      index += 1;
    }
    blocks.push(prose.join(" "));
  }

  return blocks.join("\n\n");
}

export function transcriptToMarkdown(text) {
  const raw = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s*\[music\]\s*/gi, " *[music]* ")
    .trim();
  if (!raw) return "";
  return raw
    .split(/\s*>>\s*/)
    .map((turn) => turn.trim())
    .filter(Boolean)
    .map((turn) => chunkSentences(turn, 3).join("\n\n"))
    .join("\n\n");
}
