import "./env.js";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { apiBase, apiKey, chatText, openRouterHeaders } from "./openrouter.js";
import { assertModel, clamp, fail, loadConfig, rootDir, sleep } from "./utils.js";

// generated/<id>/meta.json and video.mp4 — clips made in the Studio. Video generation is asynchronous on
// OpenRouter: submit a job, poll it, then download the file. generateVideo() waits for all of that.

const ID = /^vid-[a-z0-9]{6,20}$/;
const MAX_BYTES = 600 * 1024 * 1024;
const active = new Set();
let modelCache = { at: 0, models: null };

export function generatedDirectory() {
  const configured = process.env.TUBELOG_GENERATED_DIR?.trim();
  return path.resolve(configured ? (path.isAbsolute(configured) ? configured : path.join(rootDir, configured)) : path.join(rootDir, "generated"));
}

export function assertVideoJobId(id) {
  const value = String(id || "").trim();
  if (!ID.test(value)) throw fail("Invalid video id", 400);
  return value;
}

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function numbersIn(value) {
  const list = Array.isArray(value) ? value : value != null ? [value] : [];
  return list.map((item) => Number(String(item).replace(/s$/i, ""))).filter((number) => Number.isFinite(number) && number > 0);
}

function stringsIn(value) {
  return (Array.isArray(value) ? value : value != null ? [value] : []).map((item) => String(item)).filter(Boolean);
}

// The models endpoint lists each model's allowed durations, resolutions, aspect ratios and price.
// Field names are read loosely so a small change on their side does not break the form.
export function normalizeVideoModel(raw) {
  const id = raw?.id || raw?.slug || raw?.canonical_slug || "";
  if (!id) return null;
  const pricing = raw.pricing || raw.pricing_skus || raw.price || null;
  const perSecond = (() => {
    if (!pricing || typeof pricing !== "object") return null;
    for (const [key, value] of Object.entries(pricing)) {
      if (/second/i.test(key) && Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
    }
    return null;
  })();
  return {
    id: String(id),
    name: clip(raw.name || id, 80),
    durations: numbersIn(raw.supported_durations || raw.durations),
    resolutions: stringsIn(raw.supported_resolutions || raw.resolutions),
    aspectRatios: stringsIn(raw.supported_aspect_ratios || raw.aspect_ratios),
    perSecond,
    pricing: pricing && typeof pricing === "object" ? Object.fromEntries(Object.entries(pricing).slice(0, 6).map(([key, value]) => [key, typeof value === "object" ? JSON.stringify(value).slice(0, 80) : String(value)])) : null,
  };
}

export async function listVideoModels({ force = false } = {}) {
  const fallback = (loadConfig().studio?.models || []).map((id) => ({ id, name: id, durations: [], resolutions: [], aspectRatios: [], perSecond: null, pricing: null }));
  if (!force && modelCache.models && Date.now() - modelCache.at < 10 * 60_000) return modelCache.models;
  try {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    const response = await fetch(`${apiBase()}/videos/models`, { signal: AbortSignal.timeout(10_000), headers: key ? openRouterHeaders(key) : {} });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rows = Array.isArray(data) ? data : data.data || data.models || [];
    const models = rows.map(normalizeVideoModel).filter(Boolean);
    if (!models.length) throw new Error("empty list");
    modelCache = { at: Date.now(), models };
    return models;
  } catch {
    return fallback;
  }
}

export function studioOptions(input = {}) {
  const config = loadConfig().studio || {};
  const prompt = String(input.prompt || "").trim();
  if (prompt.length < 10) throw fail("Describe the video you want in at least a sentence", 400);
  if (prompt.length > 4000) throw fail("The prompt is too long (4000 characters at most)", 400);
  const maxSeconds = Number(config.maxSeconds) || 12;
  const duration = clamp(input.duration, 1, 600, 6);
  if (duration > maxSeconds) throw fail(`Clips are capped at ${maxSeconds} seconds to avoid surprise costs. Raise studio.maxSeconds in tubelog.config.js to allow more.`, 400);
  const aspectRatio = String(input.aspectRatio || "16:9").trim();
  if (!/^\d{1,2}:\d{1,2}$/.test(aspectRatio)) throw fail("Invalid aspect ratio", 400);
  const resolution = String(input.resolution || "720p").trim();
  if (!/^[0-9a-z]{2,10}$/i.test(resolution)) throw fail("Invalid resolution", 400);
  return {
    prompt,
    model: assertModel(input.model || config.models?.[0] || "google/veo-3.1"),
    duration,
    aspectRatio,
    resolution,
    refine: input.refine === true,
    refineModel: input.refineModel || "",
    pollMs: Number(process.env.TUBELOG_VIDEO_POLL_MS) || (Number(config.pollSeconds) || 5) * 1000,
    timeoutMs: (Number(config.timeoutMinutes) || 15) * 60_000,
  };
}

async function refinePrompt(options) {
  const { data, model } = await chatText({
    model: options.refineModel,
    maxTokens: 900,
    temperature: 0.7,
    timeoutMs: 90_000,
    system: `You are a video prompt engineer for text-to-video models. Rewrite the user's idea as ONE detailed prompt: subject, setting, camera movement and framing, lighting, mood, style, pacing, and what happens from start to end within ${options.duration} seconds. Keep every fact the user gave. Add no text overlays, logos or real people's names. Output only the prompt, no preamble.`,
    user: options.prompt,
  });
  return { prompt: clip(data, 3500), model };
}

function metaFile(id) {
  return path.join(generatedDirectory(), assertVideoJobId(id), "meta.json");
}

async function writeMeta(meta) {
  const file = metaFile(meta.id);
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, `${JSON.stringify(meta, null, 2)}\n`);
  await rename(temp, file);
}

export async function readMeta(id) {
  try {
    return JSON.parse(await readFile(metaFile(id), "utf8"));
  } catch {
    return null;
  }
}

async function patchMeta(meta, patch) {
  Object.assign(meta, patch, { updatedAt: new Date().toISOString() });
  await writeMeta(meta);
}

function resolveUrl(value) {
  const text = String(value || "");
  if (/^https?:\/\//i.test(text)) return text;
  const origin = new URL(apiBase()).origin;
  return `${origin}${text.startsWith("/") ? "" : "/"}${text}`;
}

async function jsonOrError(response, what) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.error && !data.status)) {
    const message = data.error?.message || (typeof data.error === "string" ? data.error : "") || `HTTP ${response.status}`;
    throw fail(
      response.status === 401 ? "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env." : response.status === 402 ? "OpenRouter needs credits to generate video." : `${what} failed: ${message}`,
      response.status === 401 ? 401 : response.status === 402 ? 402 : 502,
    );
  }
  return data;
}

async function submit(options, finalPrompt, key) {
  let response;
  try {
    response = await fetch(`${apiBase()}/videos`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: openRouterHeaders(key),
      body: JSON.stringify({ model: options.model, prompt: finalPrompt, duration: options.duration, resolution: options.resolution, aspect_ratio: options.aspectRatio }),
    });
  } catch (error) {
    throw fail(`OpenRouter request failed: ${error.message || "network error"}`, 502);
  }
  const data = await jsonOrError(response, "Video request");
  if (!data.id) throw fail("OpenRouter did not return a video job id", 502);
  return data;
}

async function download(urls, destination, key) {
  let lastError = "no download link";
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(300_000), headers: { Authorization: `Bearer ${key}` } });
      if (!response.ok || !response.body) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      if (Number(response.headers.get("content-length")) > MAX_BYTES) throw fail("The generated video is larger than the allowed size", 413);
      let received = 0;
      const limiter = new Transform({
        transform(chunk, _encoding, callback) {
          received += chunk.length;
          callback(received > MAX_BYTES ? fail("The generated video is larger than the allowed size", 413) : null, chunk);
        },
      });
      const partial = `${destination}.part`;
      try {
        await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(partial));
        if (received < 1000) throw new Error("file too small");
        await rename(partial, destination);
        return received;
      } catch (error) {
        await rm(partial, { force: true });
        throw error;
      }
    } catch (error) {
      if (error.status) throw error;
      lastError = error.message || "download failed";
    }
  }
  throw fail(`Could not download the finished video (${lastError})`, 502);
}

export function publicVideo(meta) {
  if (!meta) return null;
  const stale = ["submitting", "pending", "in_progress"].includes(meta.status) && !active.has(meta.id);
  return {
    id: meta.id,
    status: stale ? "interrupted" : meta.status,
    prompt: meta.prompt,
    finalPrompt: meta.finalPrompt && meta.finalPrompt !== meta.prompt ? meta.finalPrompt : "",
    refinedWith: meta.refinedWith || "",
    model: meta.model,
    duration: meta.duration,
    resolution: meta.resolution,
    aspectRatio: meta.aspectRatio,
    createdAt: meta.createdAt,
    completedAt: meta.completedAt || "",
    bytes: meta.bytes || 0,
    cost: meta.cost ?? null,
    error: stale ? "The server stopped before this video finished." : meta.error || "",
    file: meta.status === "completed" ? `/api/studio/videos/${meta.id}/file` : "",
  };
}

export async function listGenerated() {
  let names = [];
  try {
    names = await readdir(generatedDirectory());
  } catch {
    return [];
  }
  const rows = [];
  for (const name of names.filter((item) => ID.test(item))) {
    const meta = await readMeta(name);
    if (meta) rows.push(publicVideo(meta));
  }
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function deleteGenerated(id) {
  const safe = assertVideoJobId(id);
  if (active.has(safe)) throw fail("This video is still generating", 409);
  const dir = path.dirname(metaFile(safe));
  try {
    await stat(dir);
  } catch {
    return false;
  }
  await rm(dir, { recursive: true, force: true });
  return true;
}

export async function generatedFile(id) {
  const meta = await readMeta(id);
  if (meta?.status !== "completed") return null;
  const file = path.join(path.dirname(metaFile(id)), "video.mp4");
  try {
    return { file, size: (await stat(file)).size, type: "video/mp4" };
  } catch {
    return null;
  }
}

// Submit, poll until done, download. Resolves with the saved video. Progress is written to meta.json
// so the page can show a job that is still running.
export async function generateVideo(input = {}) {
  const options = studioOptions(input);
  const key = apiKey();
  const id = `vid-${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
  const meta = {
    id,
    status: "submitting",
    prompt: options.prompt,
    model: options.model,
    duration: options.duration,
    resolution: options.resolution,
    aspectRatio: options.aspectRatio,
    createdAt: new Date().toISOString(),
  };
  active.add(id);
  try {
    await writeMeta(meta);
    let finalPrompt = options.prompt;
    if (options.refine) {
      const refined = await refinePrompt(options);
      finalPrompt = refined.prompt || options.prompt;
      meta.finalPrompt = finalPrompt;
      meta.refinedWith = refined.model;
      await writeMeta(meta);
    }
    const job = await submit(options, finalPrompt, key);
    await patchMeta(meta, { status: "pending", jobId: String(job.id) });
    const pollUrl = resolveUrl(job.polling_url || `/api/v1/videos/${job.id}`);
    const started = Date.now();
    let state = job;
    while (!["completed", "failed", "cancelled", "expired"].includes(state.status)) {
      if (Date.now() - started > options.timeoutMs) throw fail("Video generation timed out. Check the job in your OpenRouter activity.", 504);
      await sleep(options.pollMs);
      const response = await fetch(pollUrl, { signal: AbortSignal.timeout(30_000), headers: openRouterHeaders(key) }).catch((error) => {
        throw fail(`OpenRouter request failed: ${error.message || "network error"}`, 502);
      });
      state = await jsonOrError(response, "Checking the video");
      if (state.status && state.status !== meta.status) await patchMeta(meta, { status: state.status });
    }
    if (state.status !== "completed") throw fail(`Video generation ${state.status}${state.error ? `: ${clip(state.error?.message || state.error, 200)}` : ""}`, 502);
    const urls = [...(Array.isArray(state.unsigned_urls) ? state.unsigned_urls.map(resolveUrl) : []), `${apiBase()}/videos/${job.id}/content?index=0`];
    const bytes = await download(urls, path.join(path.dirname(metaFile(id)), "video.mp4"), key);
    await patchMeta(meta, { status: "completed", completedAt: new Date().toISOString(), bytes, cost: state.usage?.cost ?? null });
    return publicVideo(meta);
  } catch (error) {
    await patchMeta(meta, { status: "failed", error: clip(error.message, 300) }).catch(() => {});
    throw error;
  } finally {
    active.delete(id);
  }
}
