import "./env.js";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { chatJson, UNTRUSTED_NOTE, untrusted } from "./openrouter.js";
import { channelDirectory, getChannel, listVideos } from "./storage.js";
import { fail, loadConfig, openRouterConfigured } from "./utils.js";

// videos/<channel>/memory.json — the channel's seed: a profile you write, one short digest per video
// (always built from the transcript), and a channel summary. Ideas runs inject this instead of raw transcripts.

const STOP = new Set(
  "a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just like me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who why will with would you your really going gonna kind thing things know think okay yeah well one get got want let make say said see way".split(" "),
);

export function memoryPath(slug) {
  return path.join(channelDirectory(slug), "memory.json");
}

export async function readMemory(slug) {
  try {
    const data = JSON.parse(await readFile(memoryPath(slug), "utf8"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

async function writeMemory(slug, memory) {
  const file = memoryPath(slug);
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, `${JSON.stringify(memory, null, 2)}\n`);
  await rename(temp, file);
}

function words(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !word.includes("'") && !STOP.has(word) && !/^\d+$/.test(word));
}

export function topKeywords(text, limit = 8) {
  const counts = new Map();
  for (const word of words(text)) counts.set(word, (counts.get(word) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word]) => word);
}

const clip = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const list = (value, max, each = 40) => (Array.isArray(value) ? value.map((item) => clip(item, each)).filter(Boolean).slice(0, max) : []);

function hashOf(video) {
  return createHash("sha1").update(`${video.title}\n${String(video.transcript || "").slice(0, 20_000)}`).digest("hex").slice(0, 16);
}

// Free fallback when no key is set: the opening of the transcript and its most frequent words.
function heuristicDigest(video) {
  const text = String(video.transcript || "").replace(/\s+/g, " ").trim();
  const keywords = topKeywords(text, 8);
  return { digest: clip(text, 320), topics: keywords.slice(0, 4), keywords, source: "heuristic" };
}

async function llmDigest(video, model) {
  const transcript = String(video.transcript || "").slice(0, 12_000);
  const { data } = await chatJson({
    model,
    maxTokens: 500,
    temperature: 0.2,
    system: `You summarise one YouTube video for a content strategist, using only its transcript. ${UNTRUSTED_NOTE}\nJSON shape: {"digest": "max 60 words: what the video teaches and its angle", "topics": ["up to 5 topics"], "keywords": ["up to 8 search keywords"]}`,
    user: `Title: ${video.title}\n\n${untrusted("transcript", transcript)}`,
  });
  const digest = clip(data?.digest, 480);
  if (!digest) throw fail("Empty digest", 502);
  return { digest, topics: list(data.topics, 5), keywords: list(data.keywords, 8), source: "llm" };
}

async function pool(items, size, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        out[index] = await worker(items[index], index);
      }
    }),
  );
  return out;
}

async function summarise(memory, channel, model) {
  const rows = Object.values(memory.videos).slice(0, 40);
  const keywords = topKeywords(rows.map((row) => `${row.title} ${row.keywords.join(" ")}`).join(" "), 10);
  const fallback = { niche: clip(memory.profile.niche || memory.profile.description, 200), themes: keywords.slice(0, 8), gaps: [], style: "", audience: clip(memory.profile.audience, 200) };
  if (!openRouterConfigured() || rows.length === 0) return fallback;
  try {
    const { data } = await chatJson({
      model,
      maxTokens: 700,
      temperature: 0.3,
      system: `You profile a YouTube channel from its owner's description and short per-video digests. ${UNTRUSTED_NOTE}\nJSON shape: {"niche": "one sentence", "audience": "one sentence", "style": "tone and format in one sentence", "themes": ["up to 8 recurring themes"], "gaps": ["up to 6 related topics the channel has not covered"]}`,
      user: [
        `Channel: ${channel.name}`,
        `Owner's description: ${memory.profile.description || "(none)"}`,
        `Audience: ${memory.profile.audience || "(unknown)"}`,
        `Goals: ${memory.profile.goals || "(unknown)"}`,
        "",
        ...rows.map((row) => `- ${row.title}: ${row.digest}`),
      ].join("\n"),
    });
    return {
      niche: clip(data?.niche, 240) || fallback.niche,
      audience: clip(data?.audience, 240) || fallback.audience,
      style: clip(data?.style, 240),
      themes: list(data?.themes, 8, 60).length ? list(data.themes, 8, 60) : fallback.themes,
      gaps: list(data?.gaps, 6, 80),
    };
  } catch {
    return fallback;
  }
}

// Builds or refreshes the channel memory. Only new or changed videos are digested.
export async function buildMemory(slug, { model, force = false, concurrency = 3, onProgress } = {}) {
  const channel = await getChannel(slug);
  if (!channel) throw fail("Channel not found", 404);
  const previous = (await readMemory(slug)) || {};
  const memory = {
    version: 1,
    profile: { description: "", audience: "", goals: "", ...(channel.profile || {}), ...(previous.profile || {}), ...(channel.profile || {}) },
    summary: previous.summary || {},
    videos: { ...(previous.videos || {}) },
  };
  const videos = (await listVideos({ channelSlug: slug })).filter((video) => video.transcriptAvailable && video.transcript);
  if (!videos.length) throw fail("This channel has no transcripts yet. Sync its videos first.", 422);

  const limit = Number(loadConfig().ideas?.memoryVideos) || 30;
  const recent = videos.slice(0, limit);
  const todo = recent.filter((video) => force || memory.videos[video.videoId]?.hash !== hashOf(video) || memory.videos[video.videoId]?.source === "heuristic" && openRouterConfigured());
  const useLlm = openRouterConfigured();
  let done = 0;
  await pool(todo, concurrency, async (video) => {
    let digest;
    try {
      digest = useLlm ? await llmDigest(video, model) : heuristicDigest(video);
    } catch {
      digest = heuristicDigest(video);
    }
    memory.videos[video.videoId] = {
      title: video.title,
      publishedAt: video.publishedAt || "",
      url: video.url,
      hash: hashOf(video),
      ...digest,
    };
    done += 1;
    onProgress?.(`Digested ${done}/${todo.length}: ${video.title}`);
  });
  const keep = new Set(recent.map((video) => video.videoId));
  for (const id of Object.keys(memory.videos)) if (!keep.has(id)) delete memory.videos[id];

  memory.summary = await summarise(memory, channel, model);
  memory.updatedAt = new Date().toISOString();
  memory.videoCount = Object.keys(memory.videos).length;
  await writeMemory(slug, memory);
  return { memory, digested: todo.length, usedLlm: useLlm };
}

export async function updateProfile(slug, profile) {
  const memory = (await readMemory(slug)) || { version: 1, profile: {}, summary: {}, videos: {} };
  memory.profile = { ...memory.profile, ...profile };
  await writeMemory(slug, memory);
  return memory;
}

export function memoryDigestText(memory, maxChars = 14_000) {
  const rows = Object.values(memory?.videos || {}).sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  const lines = [];
  let used = 0;
  for (const row of rows) {
    const line = `- ${row.title} — ${row.digest}${row.topics?.length ? ` [${row.topics.join(", ")}]` : ""}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length;
  }
  return lines.join("\n");
}
