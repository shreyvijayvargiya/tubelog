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

export function readableTranscript(text) {
  const sentences = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  if (!sentences.length) return [];
  const paragraphs = [];
  let bucket = [];
  for (const sentence of sentences) {
    bucket.push(sentence);
    if (bucket.length >= 4) {
      paragraphs.push(bucket.join(" "));
      bucket = [];
    }
  }
  if (bucket.length) paragraphs.push(bucket.join(" "));
  return paragraphs;
}
