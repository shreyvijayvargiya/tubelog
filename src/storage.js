import "./env.js";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { excerptAround, fail, plainExcerpt, safeJoin, slugify, videosDirectory } from "./utils.js";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MISSING_TRANSCRIPT = "_Transcript unavailable._";

function assertVideoId(videoId) {
  const id = String(videoId || "").trim();
  if (!VIDEO_ID.test(id)) throw fail("Invalid video id", 400);
  return id;
}

function assertSlug(slug) {
  const value = String(slug || "").trim();
  if (!SLUG.test(value)) throw fail("Invalid channel slug", 400);
  return value;
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function libraryRoot() {
  return ensureDir(videosDirectory());
}

function yamlValue(value) {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (value == null) return '""';
  return JSON.stringify(String(value));
}

function coerce(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null" || raw === "") return "";
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.replace(/^"|"$/g, "");
    }
  }
  return raw;
}

export function parseFrontmatter(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  if (!source.startsWith("---\n")) return { data: {}, body: source };
  const end = source.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: source };
  const data = {};
  for (const line of source.slice(4, end).split("\n")) {
    if (!line.trim()) continue;
    const index = line.indexOf(":");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    data[key] = coerce(line.slice(index + 1).trim());
  }
  return { data, body: source.slice(end + 4).replace(/^\n/, "") };
}

function section(body, title) {
  const match = String(body || "").match(new RegExp(`# ${title}\\s*\\n([\\s\\S]*?)(?=\\n---\\s*\\n# |$)`));
  return match ? match[1].trim() : "";
}

function neutralizeBreaks(text) {
  return String(text || "").replace(/^---\s*$/gm, "***");
}

export function toMarkdown(video) {
  const lines = [
    "---",
    `video_id: ${yamlValue(video.videoId)}`,
    `channel_id: ${yamlValue(video.channelId || "")}`,
    `channel: ${yamlValue(video.channel || "")}`,
    `channel_slug: ${yamlValue(video.channelSlug || "")}`,
    `title: ${yamlValue(video.title || "")}`,
    `url: ${yamlValue(video.url || "")}`,
    `thumbnail: ${yamlValue(video.thumbnail || "")}`,
    `published_at: ${yamlValue(video.publishedAt || "")}`,
    `duration: ${Number(video.duration) || 0}`,
    `description: ${yamlValue(String(video.description || "").slice(0, 5000))}`,
    `transcript_available: ${video.transcriptAvailable ? "true" : "false"}`,
    `transcript_language: ${yamlValue(video.transcriptLanguage || "")}`,
    `transcript_error: ${yamlValue(video.transcriptError || "")}`,
    `blog_generated: ${video.blogGenerated ? "true" : "false"}`,
    `blog_model: ${yamlValue(video.blogModel || "")}`,
    `blog_generated_at: ${yamlValue(video.blogGeneratedAt || "")}`,
    "---",
    "",
    "# Transcript",
    "",
    video.transcriptAvailable ? neutralizeBreaks(video.transcript).trim() : MISSING_TRANSCRIPT,
    "",
  ];
  if (video.blogGenerated && String(video.blog || "").trim()) {
    lines.push(
      "---",
      "",
      "# AI Generated Blog",
      "",
      neutralizeBreaks(video.blog).trim(),
      "",
      "---",
      "",
      "# AI Metadata",
      "",
      `model: ${video.blogModel || ""}`,
      `generated_at: ${video.blogGeneratedAt || ""}`,
      "",
    );
  }
  return `${lines.join("\n").trim()}\n`;
}

export function fromMarkdown(text, filePath = "") {
  const { data, body } = parseFrontmatter(text);
  const videoId = String(data.video_id || path.basename(filePath, ".md") || "");
  if (!VIDEO_ID.test(videoId)) return null;
  const transcriptAvailable = data.transcript_available === true;
  const blogGenerated = data.blog_generated === true;
  const blog = blogGenerated ? section(body, "AI Generated Blog") : "";
  const meta = section(body, "AI Metadata");
  const slugFromPath = filePath ? path.basename(path.dirname(filePath)) : "";
  return {
    videoId,
    channelId: String(data.channel_id || ""),
    channel: String(data.channel || ""),
    channelSlug: slugFromPath || String(data.channel_slug || ""),
    title: String(data.title || ""),
    url: String(data.url || `https://www.youtube.com/watch?v=${videoId}`),
    thumbnail: String(data.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
    publishedAt: String(data.published_at || ""),
    duration: Number(data.duration) || null,
    description: String(data.description || ""),
    transcriptAvailable,
    transcriptLanguage: String(data.transcript_language || ""),
    transcriptError: String(data.transcript_error || ""),
    transcript: transcriptAvailable ? section(body, "Transcript") : "",
    blogGenerated: Boolean(blogGenerated && blog),
    blog,
    blogModel: String(data.blog_model || meta.match(/^model:\s*(.*)$/m)?.[1] || ""),
    blogGeneratedAt: String(data.blog_generated_at || meta.match(/^generated_at:\s*(.*)$/m)?.[1] || ""),
  };
}

async function channelDirs() {
  const root = await libraryRoot();
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && SLUG.test(entry.name)).map((entry) => entry.name);
}

function channelPath(slug) {
  return safeJoin(videosDirectory(), assertSlug(slug), "channel.json");
}

function videoPath(slug, videoId) {
  return safeJoin(videosDirectory(), assertSlug(slug), `${assertVideoId(videoId)}.md`);
}

export async function readChannel(slug) {
  try {
    const raw = await readFile(channelPath(slug), "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return { ...data, slug };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error?.status) throw error;
    return null;
  }
}

async function writeChannel(channel) {
  const slug = assertSlug(channel.slug);
  await ensureDir(safeJoin(videosDirectory(), slug));
  const record = {
    id: channel.id || "",
    name: channel.name || slug,
    handle: channel.handle || "",
    slug,
    url: channel.url || "",
    description: channel.description || "",
    thumbnail: channel.thumbnail || "",
    lastSyncedAt: channel.lastSyncedAt || null,
    updatedAt: channel.updatedAt || new Date().toISOString(),
  };
  await writeFile(channelPath(slug), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export async function findChannel({ id, handle, slug } = {}) {
  const slugs = await channelDirs();
  let handleMatch = null;
  for (const folder of slugs) {
    const channel = await readChannel(folder);
    if (!channel) continue;
    if (id && channel.id && channel.id === id) return channel;
    if (slug && channel.slug === slug) return channel;
    if (handle && channel.handle && channel.handle.toLowerCase() === handle.toLowerCase()) handleMatch = channel;
  }
  return handleMatch;
}

export async function ensureChannel(input) {
  const existing = await findChannel({ id: input.id, handle: input.handle, slug: input.slug });
  let slug = existing?.slug;
  if (!slug) {
    const base = slugify(input.handle || input.name || input.id || "channel");
    slug = base;
    let attempt = 1;
    while (await readChannel(slug)) {
      attempt += 1;
      const suffix = input.id ? String(input.id).slice(-4).toLowerCase() : String(attempt);
      slug = `${base.slice(0, 48)}-${attempt === 2 ? suffix : attempt}`.replace(/[^a-z0-9-]/g, "");
    }
  }
  return writeChannel({
    ...existing,
    id: input.id || existing?.id || "",
    name: input.name || existing?.name || slug,
    handle: input.handle || existing?.handle || "",
    slug,
    url: input.url || existing?.url || "",
    description: input.description ?? existing?.description ?? "",
    thumbnail: input.thumbnail || existing?.thumbnail || "",
    lastSyncedAt: existing?.lastSyncedAt || null,
    updatedAt: new Date().toISOString(),
  });
}

export async function touchChannel(slug) {
  const channel = await readChannel(slug);
  if (!channel) return null;
  const now = new Date().toISOString();
  return writeChannel({ ...channel, lastSyncedAt: now, updatedAt: now });
}

async function videoFiles(slug) {
  const dir = safeJoin(videosDirectory(), assertSlug(slug));
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => name.endsWith(".md") && VIDEO_ID.test(name.slice(0, -3))).map((name) => path.join(dir, name));
}

async function fileMtime(file) {
  try {
    const info = await stat(file);
    return info.mtime.toISOString();
  } catch {
    return null;
  }
}

export function summarize(video, extra = {}) {
  return {
    id: video.videoId,
    videoId: video.videoId,
    title: video.title,
    url: video.url,
    channelId: video.channelId,
    channel: video.channel,
    channelSlug: video.channelSlug,
    description: video.description || "",
    thumbnail: video.thumbnail,
    publishedAt: video.publishedAt || "",
    duration: video.duration || null,
    transcriptAvailable: Boolean(video.transcriptAvailable),
    blogGenerated: Boolean(video.blogGenerated),
    language: video.transcriptLanguage || "",
    updatedAt: extra.updatedAt || null,
    excerpt: extra.excerpt || "",
    markdownPath: video.channelSlug ? `videos/${video.channelSlug}/${video.videoId}.md` : "",
  };
}

export function detail(video, extra = {}) {
  return {
    ...summarize(video, extra),
    transcript: video.transcript || "",
    transcriptError: video.transcriptError || "",
    blog: video.blog || "",
    blogModel: video.blogModel || "",
    blogGeneratedAt: video.blogGeneratedAt || "",
  };
}

async function readVideoFile(file) {
  const raw = await readFile(file, "utf8");
  const video = fromMarkdown(raw, file);
  if (!video) return null;
  video.updatedAt = await fileMtime(file);
  video.markdown = raw;
  return video;
}

export async function findVideoFile(videoId) {
  const id = assertVideoId(videoId);
  for (const slug of await channelDirs()) {
    const file = videoPath(slug, id);
    try {
      await stat(file);
      return file;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

export async function readVideo(videoId) {
  const file = await findVideoFile(videoId);
  if (!file) return null;
  return readVideoFile(file);
}

export async function videoIdsInChannel(slug) {
  const ids = new Set();
  for (const file of await videoFiles(slug)) ids.add(path.basename(file, ".md"));
  return ids;
}

export async function writeVideo(video) {
  const slug = assertSlug(video.channelSlug);
  const id = assertVideoId(video.videoId);
  if (!video.url) video.url = `https://www.youtube.com/watch?v=${id}`;
  const file = videoPath(slug, id);
  await ensureDir(path.dirname(file));
  const markdown = toMarkdown(video);
  if (/OPENROUTER_API_KEY|sk-or-/i.test(markdown)) {
    throw fail("Refusing to store a secret in a video file", 400);
  }
  await writeFile(file, markdown);
  return readVideoFile(file);
}

export async function deleteVideo(videoId) {
  const file = await findVideoFile(videoId);
  if (!file) return false;
  await rm(file);
  return true;
}

async function withCounts(channel) {
  const files = await videoFiles(channel.slug);
  let transcriptCount = 0;
  let blogCount = 0;
  let latest = channel.updatedAt || channel.lastSyncedAt || null;
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const video = fromMarkdown(raw, file);
    if (!video) continue;
    if (video.transcriptAvailable) transcriptCount += 1;
    if (video.blogGenerated) blogCount += 1;
    const mtime = await fileMtime(file);
    if (mtime && (!latest || mtime > latest)) latest = mtime;
  }
  return {
    ...channel,
    videoCount: files.length,
    transcriptCount,
    blogCount,
    updatedAt: latest,
  };
}

export async function listChannels() {
  const channels = [];
  for (const slug of await channelDirs()) {
    const channel = await readChannel(slug);
    if (channel) channels.push(await withCounts(channel));
  }
  channels.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return channels;
}

export async function getChannel(slug) {
  const channel = await readChannel(slug);
  if (!channel) return null;
  return withCounts(channel);
}

export async function listVideos({ channelSlug = "", blogsOnly = false } = {}) {
  const slugs = channelSlug ? [assertSlug(channelSlug)] : await channelDirs();
  const videos = [];
  for (const slug of slugs) {
    for (const file of await videoFiles(slug)) {
      try {
        const video = await readVideoFile(file);
        if (!video) continue;
        if (blogsOnly && !video.blogGenerated) continue;
        videos.push(video);
      } catch {
        /* skip unreadable files */
      }
    }
  }
  videos.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return videos;
}

export async function searchVideos(query, { channelSlug = "" } = {}) {
  const needle = String(query || "").trim();
  if (!needle) throw fail("Search query is required", 400);
  const videos = await listVideos({ channelSlug });
  const results = [];
  for (const video of videos) {
    const fields = [
      ["title", video.title],
      ["channel", video.channel],
      ["blog", video.blog],
      ["transcript", video.transcript],
      ["description", video.description],
    ];
    const match = fields.find(([, value]) => String(value || "").toLowerCase().includes(needle.toLowerCase()));
    if (!match) continue;
    results.push({
      ...summarize(video, { updatedAt: video.updatedAt, excerpt: plainExcerpt(video.blog || video.transcript, 180) }),
      match: { field: match[0], excerpt: excerptAround(match[1], needle) },
    });
    if (results.length >= 50) break;
  }
  return results;
}
