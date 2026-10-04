import "./env.js";
import path from "node:path";
import appConfig from "../tubelog.config.js";
import { rootDir } from "./env.js";

export { rootDir };

export function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function loadConfig() {
  const config = structuredClone(appConfig);
  const model = process.env.OPENROUTER_MODEL?.trim();
  const videosDir = process.env.TUBELOG_VIDEOS_DIR?.trim();
  const github = process.env.TUBELOG_GITHUB_URL?.trim();
  if (model) {
    config.ai.model = model;
    const ids = config.ai.models.map((entry) => (typeof entry === "string" ? entry : entry.id));
    if (!ids.includes(model)) {
      config.ai.models.unshift({
        id: model,
        label: model,
        free: model.endsWith(":free") || model === "openrouter/free",
      });
    }
  }
  if (videosDir) config.videosDir = videosDir;
  if (github) config.github = github;
  return config;
}

export function videosDirectory() {
  const configured = loadConfig().videosDir || "./videos";
  const dir = path.isAbsolute(configured) ? configured : path.join(rootDir, configured);
  return path.resolve(dir);
}

export function safeJoin(parent, ...parts) {
  const root = path.resolve(parent);
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw fail("Invalid path", 400);
  }
  return target;
}

export function slugify(value) {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "channel";
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
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

export function excerptAround(text, query) {
  const haystack = String(text || "").replace(/\s+/g, " ").trim();
  const needle = String(query || "").trim().toLowerCase();
  if (!haystack || !needle) return "";
  const index = haystack.toLowerCase().indexOf(needle);
  if (index < 0) return "";
  const start = Math.max(0, index - 70);
  const end = Math.min(haystack.length, index + needle.length + 90);
  return `${start > 0 ? "…" : ""}${haystack.slice(start, end).trim()}${end < haystack.length ? "…" : ""}`;
}

export function plainExcerpt(markdown, limit = 180) {
  const text = String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_~\[\]()`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}…`;
}

export function assertModel(model) {
  const value = String(model || "").trim();
  if (!value || value.length > 120 || !/^[a-z0-9_.:@+\-/]+$/i.test(value)) {
    throw fail("Invalid model id", 400);
  }
  if (/sk-|bearer|api[_-]?key/i.test(value)) throw fail("Invalid model id", 400);
  return value;
}

export function openRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}
