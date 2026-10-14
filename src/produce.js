import "./env.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { drawImage } from "./instagram.js";
import { ideasDir, updateIdea } from "./ideas-store.js";
import { readMemory } from "./memory.js";
import { chatJson, chatText, UNTRUSTED_NOTE, untrusted } from "./openrouter.js";
import { assertModel, clamp, fail, loadConfig } from "./utils.js";

// The agent only suggests ideas. This runs when you click "Generate": script, assets and a music brief,
// all three at the same time, each saved onto the idea.

const clip = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const strings = (value, max, each) => (Array.isArray(value) ? value.map((item) => clip(item, each)).filter(Boolean).slice(0, max) : []);

const MUSIC_LIBRARIES = [
  { name: "YouTube Audio Library", url: "https://studio.youtube.com/channel/music" },
  { name: "Pixabay Music", url: "https://pixabay.com/music/" },
  { name: "Free Music Archive", url: "https://freemusicarchive.org/" },
];

export function produceOptions(input = {}) {
  const config = loadConfig();
  return {
    script: input.script !== false,
    assets: input.assets !== false,
    music: input.music !== false,
    images: input.images === true,
    model: input.model || "",
    imageModel: assertModel(input.imageModel || config.instagram?.imageModel || "google/gemini-2.5-flash-image"),
    language: clip(input.language || config.blog?.language || "English", 40),
    minutes: clamp(input.minutes, 1, 30, 8),
  };
}

function ideaBrief(idea) {
  return [
    `Idea: ${idea.title}`,
    `Hook: ${idea.hook}`,
    `Angle: ${idea.angle}`,
    `Why now: ${idea.whyNow}`,
    `Audience: ${idea.audience}`,
    `Format: ${idea.format}`,
    `Keywords: ${(idea.keywords || []).join(", ")}`,
  ].join("\n");
}

function channelVoice(memory) {
  const summary = memory?.summary || {};
  const recent = Object.values(memory?.videos || {}).slice(0, 5).map((video) => `- ${video.title}: ${video.digest}`).join("\n");
  return [`Niche: ${summary.niche || ""}`, `Style: ${summary.style || ""}`, `Audience: ${summary.audience || ""}`, `Recent videos:\n${recent}`].join("\n");
}

function sourceList(idea) {
  return (idea.sources || []).map((source, index) => `S${index + 1} [${source.type}] ${source.title}${source.snippet ? ` — ${source.snippet}` : ""}`).join("\n");
}

async function makeScript(idea, memory, options) {
  const { data, model } = await chatText({
    model: options.model,
    maxTokens: 5000,
    temperature: 0.7,
    timeoutMs: 150_000,
    system: `You write YouTube scripts in the creator's own voice. Write in ${options.language}. ${UNTRUSTED_NOTE}
Structure, in Markdown: a short title block (3 title options), "Hook" (first 15 seconds, spoken), "Intro", numbered sections each with an estimated timestamp and the spoken lines, [B-ROLL: ...] cues in brackets, "Call to action", "Outro". Target about ${options.minutes} minutes of speech.
Only state facts that appear in the cited sources or in the channel's own material. Mark a claim from a source with [S1] style tags that match the source ids. Do not invent statistics, quotes or links.`,
    user: `${ideaBrief(idea)}\n\nChannel voice:\n${channelVoice(memory)}\n\nSources:\n${untrusted("sources", sourceList(idea) || "(none)")}`,
  });
  return { markdown: String(data).replace(/^```(?:markdown|md)?\s*|\s*```$/gi, "").trim(), model };
}

async function makeAssets(idea, memory, options) {
  const { data, model } = await chatJson({
    model: options.model,
    maxTokens: 1800,
    temperature: 0.7,
    system: `You are a YouTube packaging and production assistant. Propose visual assets for one video. Write in ${options.language}.
JSON shape: {"thumbnails":[{"concept":"one sentence","textOverlay":"max 4 words","prompt":"an image-generation prompt for a 16:9 thumbnail, no text in the image"}],"shots":[{"section":"which part of the video","visual":"what is on screen","note":"how to get or make it"}]}
Give 3 thumbnails and 6 to 10 shots.`,
    user: `${ideaBrief(idea)}\n\nChannel voice:\n${channelVoice(memory)}`,
  });
  return {
    model,
    thumbnails: (Array.isArray(data?.thumbnails) ? data.thumbnails : []).slice(0, 4).map((item) => ({ concept: clip(item.concept, 200), textOverlay: clip(item.textOverlay, 40), prompt: clip(item.prompt, 600) })).filter((item) => item.concept),
    shots: (Array.isArray(data?.shots) ? data.shots : []).slice(0, 12).map((item) => ({ section: clip(item.section, 80), visual: clip(item.visual, 240), note: clip(item.note, 240) })).filter((item) => item.visual),
  };
}

async function makeMusic(idea, memory, options) {
  const { data, model } = await chatJson({
    model: options.model,
    maxTokens: 900,
    temperature: 0.6,
    system: `You are a music supervisor for a YouTube creator. Describe the background music for one video so it can be found in a royalty-free library or commissioned. No voiceover.
JSON shape: {"mood":"two or three words","bpm":100,"energy":"low|medium|high","instruments":["..."],"structure":[{"part":"intro|build|main|outro","seconds":15,"description":"..."}],"searchTerms":["terms to type into a music library"]}`,
    user: `${ideaBrief(idea)}\n\nChannel voice:\n${channelVoice(memory)}`,
  });
  return {
    model,
    mood: clip(data?.mood, 60),
    bpm: clamp(data?.bpm, 50, 200, 100),
    energy: ["low", "medium", "high"].includes(data?.energy) ? data.energy : "medium",
    instruments: strings(data?.instruments, 6, 40),
    structure: (Array.isArray(data?.structure) ? data.structure : []).slice(0, 6).map((item) => ({ part: clip(item.part, 20), seconds: clamp(item.seconds, 3, 180, 15), description: clip(item.description, 200) })),
    searchTerms: strings(data?.searchTerms, 6, 50),
    libraries: MUSIC_LIBRARIES,
  };
}

async function drawThumbnails(slug, idea, thumbnails, options) {
  const dir = path.join(ideasDir(slug), idea.id);
  await mkdir(dir, { recursive: true });
  const rows = await Promise.allSettled(
    thumbnails.slice(0, 2).map(async (thumb, index) => {
      const file = await drawImage(`${thumb.prompt}. YouTube thumbnail, 16:9, bold and clear, no text.`, options.imageModel, "16:9");
      const name = `thumb-${index + 1}.${file.ext}`;
      await writeFile(path.join(dir, name), file.buffer);
      return { name, concept: thumb.concept, url: `/api/channels/${slug}/ideas/${idea.id}/files/${name}` };
    }),
  );
  const images = rows.filter((row) => row.status === "fulfilled").map((row) => row.value);
  const errors = rows.filter((row) => row.status === "rejected").map((row) => clip(row.reason?.message, 160));
  return { images, errors };
}

export async function produceIdea(slug, idea, input = {}) {
  const options = produceOptions(input);
  if (!options.script && !options.assets && !options.music) throw fail("Choose at least one thing to generate", 400);
  const memory = await readMemory(slug);
  const tasks = {
    script: options.script ? makeScript(idea, memory, options) : null,
    assets: options.assets ? makeAssets(idea, memory, options) : null,
    music: options.music ? makeMusic(idea, memory, options) : null,
  };
  const names = Object.keys(tasks).filter((name) => tasks[name]);
  const settled = await Promise.allSettled(names.map((name) => tasks[name]));
  const patch = {};
  const errors = {};
  settled.forEach((result, index) => {
    const name = names[index];
    if (result.status === "fulfilled") patch[name] = { ...result.value, generatedAt: new Date().toISOString() };
    else errors[name] = clip(result.reason?.message || "failed", 200);
  });
  if (!Object.keys(patch).length) throw fail(`Nothing was generated: ${Object.values(errors).join("; ")}`, 502);

  if (options.images && patch.assets?.thumbnails?.length) {
    const drawn = await drawThumbnails(slug, idea, patch.assets.thumbnails, options);
    patch.assets.images = drawn.images;
    if (drawn.errors.length) errors.images = drawn.errors[0];
  }
  if (patch.script) patch.status = idea.status === "dismissed" ? "dismissed" : "scripted";
  const updated = await updateIdea(slug, idea.id, patch);
  return { idea: updated, errors };
}

export function ideaFileName(name) {
  return /^thumb-[1-4]\.(png|jpe?g|webp)$/.test(name) ? name : null;
}
