import "./env.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertModel, fail, loadConfig, rootDir } from "./utils.js";

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_TRANSCRIPT_CHARS = 80_000;

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
    promptCache = await readFile(path.join(rootDir, "prompts", "blog-writer.md"), "utf8");
  }
  return promptCache;
}

function styleLine(style) {
  const lines = {
    educational: "Teach the ideas in a clear educational article.",
    tutorial: "Write it as a tutorial the reader can follow step by step.",
    explainer: "Explain the topic in plain language and define terms as you go.",
    technical: "Write a technical article. Keep precise terminology and explain code from the transcript.",
    beginner: "Write for a beginner. Use short sections and define jargon.",
  };
  return lines[style] || lines.educational;
}

function messageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("\n");
  }
  return "";
}

function stripFences(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function buildUserPrompt(video, options) {
  const transcript = String(video.transcript || "").slice(0, MAX_TRANSCRIPT_CHARS);
  const truncated = String(video.transcript || "").length > transcript.length;
  return [
    `Title: ${video.title || ""}`,
    `Channel: ${video.channel || ""}`,
    `URL: ${video.url || ""}`,
    `Description: ${video.description || "(none)"}`,
    `Write in ${options.language}.`,
    styleLine(options.style),
    options.includeTakeaways ? "Include a Key Takeaways section." : "Omit the Key Takeaways section.",
    options.includeOriginalVideo
      ? "Include an Original Video section with the source title, channel, and URL."
      : "Omit the Original Video section.",
    options.includeCodeExamples
      ? "When the transcript contains code, include the code in fenced blocks and explain it."
      : "If the transcript contains code, explain what it does and keep only short essential snippets.",
    truncated ? "The transcript was truncated for length. Use only the portion below." : "",
    "",
    "Transcript:",
    transcript,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function blogOptions(input = {}) {
  const config = loadConfig();
  const styles = new Set(config.blog.styles.map((style) => style.id));
  const style = styles.has(input.style) ? input.style : config.blog.style;
  const language = String(input.language || config.blog.language || "English").trim().slice(0, 40) || "English";
  const model = assertModel(input.model || config.ai.model);
  return {
    model,
    style,
    language,
    includeTakeaways: input.includeTakeaways !== false,
    includeOriginalVideo: input.includeOriginalVideo !== false,
    includeCodeExamples: input.includeCodeExamples === true,
  };
}

async function complete(video, options) {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw fail("OPENROUTER_API_KEY is not set. Add it to .env and restart TubeLog.", 400);
  }
  const system = await systemPrompt();
  let response;
  try {
    response = await fetch(CHAT_URL, {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "TubeLog",
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0.4,
        max_tokens: 6000,
        messages: [
          { role: "system", content: system },
          { role: "user", content: buildUserPrompt(video, options) },
        ],
      }),
    });
  } catch (error) {
    throw fail(`OpenRouter request failed: ${error.message || "network error"}`, 502);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const message = data.error?.message || data.error || `HTTP ${response.status}`;
    throw fail(
      response.status === 401
        ? "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env."
        : `OpenRouter request failed: ${message}`,
      502,
    );
  }
  const markdown = stripFences(messageText(data.choices?.[0]?.message?.content));
  if (!markdown) throw fail("OpenRouter returned an empty blog", 502);
  return {
    markdown,
    model: data.model || options.model,
    generatedAt: new Date().toISOString(),
  };
}

export function generateBlog(video, input = {}) {
  if (!video?.transcript) throw fail("A transcript is required before generating a blog", 422);
  const options = blogOptions(input);
  return enqueue(() => complete(video, options));
}
