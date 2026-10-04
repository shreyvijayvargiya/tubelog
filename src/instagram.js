import "./env.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { saveInstagram } from "./storage.js";
import { assertModel, fail, loadConfig, rootDir } from "./utils.js";

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const IMAGE_URL = "https://openrouter.ai/api/v1/images";
const MAX_TRANSCRIPT_CHARS = 24_000;
const SLIDE_COUNT = 6;

let queue = Promise.resolve();
let promptCache = "";

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function systemPrompt() {
  if (!promptCache) {
    promptCache = await readFile(path.join(rootDir, "prompts", "instagram-writer.md"), "utf8");
  }
  return promptCache;
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

function clip(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function stripFences(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function messageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("\n");
  }
  return "";
}

export function instagramOptions(input = {}) {
  const config = loadConfig();
  const themes = config.instagram?.themes || [];
  const theme = themes.find((item) => item.id === input.theme) || themes[0];
  if (!theme) throw fail("No Instagram themes are configured", 500);
  const imageModels = new Set((config.instagram?.imageModels || []).map((item) => item.id));
  const requestedImage = input.imageModel || config.instagram?.imageModel;
  const imageModel = assertModel(imageModels.has(requestedImage) ? requestedImage : config.instagram.imageModel);
  const textDefault = (config.ai.models || []).find((item) => item.free)?.id || config.ai.model;
  return {
    theme,
    model: assertModel(input.model || textDefault),
    imageModel,
    language: String(input.language || config.blog.language || "English").trim().slice(0, 40) || "English",
  };
}

export function parseCarousel(text) {
  const raw = stripFences(text);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw fail("OpenRouter did not return carousel JSON", 502);
  let data;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw fail("OpenRouter returned carousel text that was not JSON", 502);
  }
  const slides = Array.isArray(data.slides) ? data.slides : [];
  if (slides.length < 5) throw fail("OpenRouter returned too few carousel slides. Try again.", 502);
  const roles = ["hook", "point", "point", "point", "point", "close"];
  return {
    caption: clip(data.caption, 500),
    slides: slides.slice(0, SLIDE_COUNT).map((slide, index) => ({
      index: index + 1,
      role: roles[index] || "point",
      headline: clip(slide.headline || slide.title, 80),
      text: clip(slide.text || slide.body, 180),
    })),
  };
}

function openRouterError(response, data, fallback) {
  const message = data.error?.message || data.error || fallback;
  if (response.status === 401) return fail("OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.", 502);
  if (response.status === 402) {
    return fail("OpenRouter needs credits to draw images with Nano Banana. FREE text models do not cover image generation.", 402);
  }
  return fail(`OpenRouter request failed: ${message}`, 502);
}

async function chat(model, system, user) {
  const key = apiKey();
  let response;
  try {
    response = await fetch(CHAT_URL, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: headers(key),
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 1800,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (error) {
    throw fail(`OpenRouter request failed: ${error.message || "network error"}`, 502);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw openRouterError(response, data, `HTTP ${response.status}`);
  const text = messageText(data.choices?.[0]?.message?.content);
  if (!text) throw fail("OpenRouter returned an empty carousel", 502);
  return { text, model: data.model || model };
}

function imageBuffer(value) {
  const raw = String(value || "");
  const dataUrl = raw.match(/^data:image\/[a-z0-9.+-]+;base64,([\s\S]+)$/i);
  const base64 = (dataUrl ? dataUrl[1] : raw).replace(/\s/g, "");
  if (!base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length < 1000 || buffer.length > 8_000_000) return null;
  return buffer;
}

function imageFile(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return { buffer, ext: "png", type: "image/png" };
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return { buffer, ext: "jpg", type: "image/jpeg" };
  if (buffer.slice(0, 4).toString() === "RIFF" && buffer.slice(8, 12).toString() === "WEBP") {
    return { buffer, ext: "webp", type: "image/webp" };
  }
  return null;
}

async function fileFromUrl(url) {
  const inline = imageBuffer(url);
  if (inline) return imageFile(inline);
  if (!String(url || "").startsWith("https://")) return null;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1000 || buffer.length > 8_000_000) return null;
  return imageFile(buffer);
}

async function imageFromPayload(data) {
  const direct = data.data?.[0];
  const decoded = direct?.b64_json ? imageBuffer(direct.b64_json) : null;
  const fromDirect = (decoded && imageFile(decoded)) || (direct?.url ? await fileFromUrl(direct.url) : null);
  if (fromDirect) return fromDirect;
  const message = data.choices?.[0]?.message;
  const candidates = [...(message?.images || []), ...(Array.isArray(message?.content) ? message.content : [])];
  for (const image of candidates) {
    const file = await fileFromUrl(image?.image_url?.url || image?.url);
    if (file) return file;
  }
  return null;
}

async function drawImage(prompt, model) {
  const key = apiKey();
  let response;
  try {
    response = await fetch(IMAGE_URL, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: headers(key),
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        aspect_ratio: "4:5",
      }),
    });
  } catch (error) {
    throw fail(`OpenRouter image request failed: ${error.message || "network error"}`, 502);
  }
  let data = await response.json().catch(() => ({}));
  let file = response.ok ? await imageFromPayload(data) : null;
  if (!file && response.status !== 401 && response.status !== 402) {
    try {
      response = await fetch(CHAT_URL, {
        method: "POST",
        signal: AbortSignal.timeout(90_000),
        headers: headers(key),
        body: JSON.stringify({
          model,
          modalities: ["image", "text"],
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (error) {
      throw fail(`OpenRouter image request failed: ${error.message || "network error"}`, 502);
    }
    data = await response.json().catch(() => ({}));
    if (response.ok) file = await imageFromPayload(data);
  }
  if (!response.ok && !file) throw openRouterError(response, data, `HTTP ${response.status}`);
  if (!file) throw fail("Nano Banana returned no image for a carousel slide", 502);
  return file;
}

function imagePrompt(slide, theme) {
  return [
    "Instagram carousel slide, portrait 4:5.",
    theme.look,
    `Render this headline in large readable type, exactly: "${slide.headline}"`,
    slide.text ? `Render this smaller line exactly: "${slide.text}"` : "",
    "No watermark, no logo, no tiny text, no extra sentences.",
  ]
    .filter(Boolean)
    .join(" ");
}

function userPrompt(video, options) {
  const transcript = String(video.transcript || "").slice(0, MAX_TRANSCRIPT_CHARS);
  return [
    `Title: ${video.title || ""}`,
    `Channel: ${video.channel || ""}`,
    `Theme: ${options.theme.label}`,
    `Hook: ${options.theme.hook}`,
    `Write in ${options.language}.`,
    "Use only what the transcript supports.",
    "",
    "Transcript:",
    transcript,
  ].join("\n");
}

async function createCarousel(video, options) {
  const system = await systemPrompt();
  const written = await chat(options.model, system, userPrompt(video, options));
  const carousel = parseCarousel(written.text);
  const files = [];
  for (const slide of carousel.slides) {
    if (!slide.headline) throw fail("A carousel slide was missing its headline", 502);
    const image = await drawImage(imagePrompt(slide, options.theme), options.imageModel);
    files.push({ index: slide.index, ...image });
  }
  const saved = await saveInstagram(
    video,
    {
      theme: options.theme.id,
      themeLabel: options.theme.label,
      model: written.model,
      imageModel: options.imageModel,
      generatedAt: new Date().toISOString(),
      caption: carousel.caption,
      slides: carousel.slides,
    },
    files,
  );
  return saved;
}

export function generateInstagram(video, input = {}) {
  if (!video?.transcript) throw fail("A transcript is required before creating an Instagram carousel", 422);
  const options = instagramOptions(input);
  return enqueue(() => createCarousel(video, options));
}
