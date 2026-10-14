import "./env.js";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { publicTranslation, translationDir } from "./storage.js";
import { assertModel, fail, loadConfig, safeJoin, videosDirectory } from "./utils.js";

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".webm", ".mov"];
const SPEECH_CHUNK_CHARS = 1200;
const TRANSLATE_CHUNK_CHARS = 3500;
const PCM_RATE = 24000;

let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function apiBase() {
  return (process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
}

function apiKey() {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw fail("OPENROUTER_API_KEY is not set. Add it to .env and restart TubeLog.", 400);
  return key;
}

function headers(key) {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "TubeLog",
  };
}

export function languageKey(language) {
  const key = String(language || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/, "");
  if (!key) throw fail("language is required. Use the language's English name, for example Spanish.", 400);
  return key;
}

export function translationOptions(input = {}) {
  const config = loadConfig();
  const settings = config.translation || {};
  const language = String(input.language || "").trim().slice(0, 40);
  if (!language) throw fail("language is required", 400);
  const voice = String(input.voice || settings.voice || "alloy").trim();
  if (!/^[a-z0-9_-]{2,30}$/i.test(voice)) throw fail("Invalid voice", 400);
  return {
    language,
    key: languageKey(language),
    voice,
    model: assertModel(input.model || config.ai.model),
    ttsModel: assertModel(input.ttsModel || process.env.OPENROUTER_TTS_MODEL?.trim() || settings.ttsModel),
    replaceAudio: input.replaceAudio !== false,
    videoUrl: String(input.videoUrl || "").trim(),
    maxChars: Number(settings.maxChars) || 15000,
    maxVideoBytes: (Number(settings.maxVideoMB) || 1024) * 1024 * 1024,
  };
}

function splitText(text, size) {
  const sentences = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?。！？])\s+/);
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > size) {
      chunks.push(current);
      current = "";
    }
    if (sentence.length > size) {
      for (let index = 0; index < sentence.length; index += size) chunks.push(sentence.slice(index, index + size));
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function messageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("\n");
  return "";
}

async function openRouterError(response) {
  const data = await response.json().catch(() => ({}));
  const message = data.error?.message || data.error || `HTTP ${response.status}`;
  return fail(
    response.status === 401
      ? "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env."
      : `OpenRouter request failed: ${message}`,
    502,
  );
}

async function translateChunk(text, options, key) {
  let response;
  try {
    response = await fetch(`${apiBase()}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      headers: headers(key),
      body: JSON.stringify({
        model: options.model,
        temperature: 0.2,
        max_tokens: 4000,
        messages: [
          {
            role: "system",
            content: `You are a professional translator. Translate the user's text into ${options.language}. Keep the meaning, tone and names. Write it so it sounds natural when read aloud. Output only the translation, with no notes, quotes or formatting.`,
          },
          { role: "user", content: text },
        ],
      }),
    });
  } catch (error) {
    throw fail(`OpenRouter request failed: ${error.message || "network error"}`, 502);
  }
  if (!response.ok) throw await openRouterError(response);
  const data = await response.json().catch(() => ({}));
  if (data.error) throw fail(`OpenRouter request failed: ${data.error.message || data.error}`, 502);
  const out = messageText(data.choices?.[0]?.message?.content).trim();
  if (!out) throw fail("OpenRouter returned an empty translation", 502);
  return out;
}

async function translateText(transcript, options, key) {
  const source = String(transcript || "").replace(/\s+/g, " ").trim();
  const truncated = source.length > options.maxChars;
  const parts = [];
  for (const chunk of splitText(source.slice(0, options.maxChars), TRANSLATE_CHUNK_CHARS)) {
    parts.push(await translateChunk(chunk, options, key));
  }
  return { text: parts.join("\n\n"), truncated, sourceChars: Math.min(source.length, options.maxChars) };
}

// Streams one chunk of speech from an OpenRouter audio-output model and returns raw 24 kHz mono PCM16.
async function speakChunk(text, options, key) {
  let response;
  try {
    response = await fetch(`${apiBase()}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(300_000),
      headers: headers(key),
      body: JSON.stringify({
        model: options.ttsModel,
        modalities: ["text", "audio"],
        audio: { voice: options.voice, format: "pcm16" },
        stream: true,
        messages: [
          {
            role: "system",
            content: `You are a voice actor. Read the user's text aloud in ${options.language} exactly as written, at a natural pace. Do not add, remove or comment on any words.`,
          },
          { role: "user", content: text },
        ],
      }),
    });
  } catch (error) {
    throw fail(`OpenRouter request failed: ${error.message || "network error"}`, 502);
  }
  if (!response.ok) throw await openRouterError(response);
  const buffers = [];
  let pending = "";
  const decoder = new TextDecoder();
  const handle = (line) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }
    if (event.error) throw fail(`OpenRouter request failed: ${event.error.message || event.error}`, 502);
    const data = event.choices?.[0]?.delta?.audio?.data;
    if (data) buffers.push(Buffer.from(data, "base64"));
  };
  for await (const part of response.body) {
    pending += decoder.decode(part, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() || "";
    for (const line of lines) handle(line.trim());
  }
  handle(pending.trim());
  const pcm = Buffer.concat(buffers);
  if (!pcm.length) {
    throw fail(
      `The speech model ${options.ttsModel} returned no audio. Choose a model that supports audio output (set OPENROUTER_TTS_MODEL in .env).`,
      502,
    );
  }
  return pcm;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err = (err + chunk).slice(-2000)));
    child.on("error", (error) => {
      reject(
        error.code === "ENOENT"
          ? fail(`${command} is not installed. Install ffmpeg (https://ffmpeg.org/download.html) and try again.`, 500)
          : fail(`${command} failed: ${error.message}`, 500),
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(fail(`${command} failed: ${err.trim().split("\n").slice(-3).join(" ")}`, 500));
    });
  });
}

async function duration(file) {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const seconds = Number.parseFloat(out);
  return Number.isFinite(seconds) ? seconds : 0;
}

async function speak(text, options, key, outFile) {
  const buffers = [];
  for (const chunk of splitText(text, SPEECH_CHUNK_CHARS)) buffers.push(await speakChunk(chunk, options, key));
  const rawFile = `${outFile}.pcm`;
  await writeFile(rawFile, Buffer.concat(buffers));
  try {
    await run("ffmpeg", [
      "-y",
      "-loglevel", "error",
      "-f", "s16le",
      "-ar", String(PCM_RATE),
      "-ac", "1",
      "-i", rawFile,
      "-c:a", "libmp3lame",
      "-q:a", "4",
      outFile,
    ]);
  } finally {
    await rm(rawFile, { force: true });
  }
}

async function findLocalVideo(slug, videoId) {
  for (const ext of VIDEO_EXTENSIONS) {
    const file = safeJoin(videosDirectory(), slug, `${videoId}${ext}`);
    try {
      if ((await stat(file)).isFile()) return file;
    } catch {
      /* try the next extension */
    }
  }
  return "";
}

export function privateAddress(address) {
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    if (lower.startsWith("::ffff:")) return privateAddress(lower.slice(7));
    return lower === "::1" || lower === "::" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  const [a, b] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw fail("videoUrl must be a valid http(s) URL", 400);
  }
  if (!["http:", "https:"].includes(url.protocol)) throw fail("videoUrl must be an http(s) URL", 400);
  const addresses = net.isIP(url.hostname) ? [{ address: url.hostname }] : await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw fail("videoUrl host could not be resolved", 400);
  if (addresses.some((item) => privateAddress(item.address))) throw fail("videoUrl must point to a public host", 400);
  return url;
}

async function downloadVideo(rawUrl, destination, maxBytes) {
  let url = await assertPublicUrl(rawUrl);
  let response;
  for (let hop = 0; hop < 4; hop += 1) {
    try {
      response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(600_000) });
    } catch (error) {
      throw fail(`Could not download the video: ${error.message || "network error"}`, 502);
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = await assertPublicUrl(new URL(response.headers.get("location"), url).href);
      continue;
    }
    break;
  }
  if (!response?.ok || !response.body) throw fail(`Could not download the video (HTTP ${response?.status || "error"})`, 502);
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) throw fail("The video is larger than the allowed download size", 413);
  const partial = `${destination}.part`;
  let received = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      callback(received > maxBytes ? fail("The video is larger than the allowed download size", 413) : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(partial));
    await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", partial]);
    await rename(partial, destination);
  } catch (error) {
    await rm(partial, { force: true });
    throw error.status ? error : fail("The downloaded file is not a playable video", 422);
  }
}

// Removes the original audio track, fits the dubbed audio to the video length and muxes them into a new mp4.
async function dubVideo(videoFile, audioFile, outFile) {
  const [videoSeconds, audioSeconds] = await Promise.all([duration(videoFile), duration(audioFile)]);
  const filters = [];
  if (videoSeconds > 0 && audioSeconds > videoSeconds) {
    filters.push(`atempo=${Math.min(2, audioSeconds / videoSeconds).toFixed(4)}`);
  }
  filters.push("apad");
  const base = [
    "-y",
    "-loglevel", "error",
    "-i", videoFile,
    "-i", audioFile,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-af", filters.join(","),
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
  ];
  const partial = `${outFile}.part.mp4`;
  try {
    try {
      await run("ffmpeg", [...base, "-c:v", "copy", partial]);
    } catch {
      await run("ffmpeg", [...base, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", partial]);
    }
    await rename(partial, outFile);
  } finally {
    await rm(partial, { force: true });
  }
  return { videoSeconds, audioSeconds };
}

async function translate(video, options) {
  const key = apiKey();
  const dir = translationDir(video.channelSlug, video.videoId);
  let source = options.replaceAudio ? await findLocalVideo(video.channelSlug, video.videoId) : "";
  if (options.replaceAudio && !source && options.videoUrl) await assertPublicUrl(options.videoUrl);
  await mkdir(dir, { recursive: true });
  const base = path.join(dir, options.key);

  const { text, truncated, sourceChars } = await translateText(video.transcript, options, key);
  await writeFile(`${base}.md`, `# ${video.title || video.videoId} (${options.language})\n\n${text}\n`);
  await speak(text, options, key, `${base}.mp3`);

  let videoFile = "";
  let videoSkipped = "";
  let fit = null;
  if (options.replaceAudio) {
    if (!source && options.videoUrl) {
      source = safeJoin(videosDirectory(), video.channelSlug, `${video.videoId}.mp4`);
      await downloadVideo(options.videoUrl, source, options.maxVideoBytes);
    }
    if (source) {
      fit = await dubVideo(source, `${base}.mp3`, `${base}.mp4`);
      videoFile = `${options.key}.mp4`;
    } else {
      await rm(`${base}.mp4`, { force: true });
      videoSkipped = `No local video file found. Put ${video.videoId}.mp4 in videos/${video.channelSlug}/ or pass videoUrl, then run again.`;
    }
  } else {
    await rm(`${base}.mp4`, { force: true });
  }

  const record = {
    key: options.key,
    language: options.language,
    voice: options.voice,
    model: options.model,
    ttsModel: options.ttsModel,
    generatedAt: new Date().toISOString(),
    characters: sourceChars,
    truncated,
    audio: `${options.key}.mp3`,
    text: `${options.key}.md`,
    video: videoFile,
    videoSkipped,
    folder: `videos/${video.channelSlug}/translations/${video.videoId}`,
    ...(fit ? { audioSeconds: fit.audioSeconds, videoSeconds: fit.videoSeconds } : {}),
  };
  const json = `${JSON.stringify(record, null, 2)}\n`;
  if (/OPENROUTER_API_KEY|sk-or-/i.test(json)) throw fail("Refusing to store a secret in a translation file", 400);
  await writeFile(`${base}.json`, json);
  return publicTranslation(video.videoId, record);
}

export function generateTranslation(video, input = {}) {
  if (!video?.transcriptAvailable || !video.transcript) {
    throw fail("A transcript is required before translating", 422);
  }
  const options = translationOptions(input);
  return enqueue(() => translate(video, options));
}
