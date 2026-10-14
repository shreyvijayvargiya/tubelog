import "./env.js";
import { randomBytes } from "node:crypto";
import { buildMemory, memoryDigestText, readMemory, topKeywords } from "./memory.js";
import { chatJson, UNTRUSTED_NOTE, untrusted } from "./openrouter.js";
import { appendRun, recentIdeaTitles } from "./ideas-store.js";
import { runResearch, SOURCE_NAMES } from "./research.js";
import { getChannel } from "./storage.js";
import { clamp, fail, loadConfig } from "./utils.js";

const FORMATS = new Set(["tutorial", "explainer", "listicle", "reaction", "case-study", "opinion", "short"]);
const clip = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const strings = (value, max, each) => (Array.isArray(value) ? value.map((item) => clip(item, each)).filter(Boolean).slice(0, max) : []);

const STOP = new Set("the and for with that this from your you are how what why when new best about into over using use make".split(" "));
function titleTokens(title) {
  return new Set(String(title || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((word) => word.length > 2 && !STOP.has(word)));
}
function similar(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export function ideasOptions(input = {}) {
  const config = loadConfig().ideas || {};
  const sources = Array.isArray(input.sources) ? input.sources.filter((name) => SOURCE_NAMES.includes(name)) : [];
  return {
    focus: clip(input.focus, 160),
    count: clamp(input.count, 3, 12, Number(config.count) || 8),
    model: input.model || "",
    sources,
  };
}

function buildQueries(memory, channel, focus, max) {
  const themes = (memory.summary?.themes || []).map((item) => clip(item, 60));
  const fallback = topKeywords(Object.values(memory.videos || {}).map((video) => video.title).join(" "), 4);
  const base = (themes.length ? themes : fallback).slice(0, max);
  const queries = [...new Set((focus ? [focus, ...base.slice(0, Math.max(1, max - 1))] : base).filter(Boolean))].slice(0, max);
  return queries.length ? queries : [clip(channel.name, 60)];
}

function systemPrompt() {
  return `You are a research-only content strategist for one YouTube creator. You find NEW video ideas by combining what their channel already covers with what is trending and being discussed right now.
You do NOT write scripts, outlines or video text. You only propose ideas and explain why they would work.
Rules:
- Every idea must be clearly different from the channel's existing videos and from the "already suggested" list.
- Fit the channel's niche and audience. Prefer ideas where fresh news or trends give a reason to publish now.
- Cite sources ONLY by their ids (S1, S2, ...) from the research list. Never invent links, numbers or quotes. An idea based only on the channel's own content may have no sources.
- "hook" is one sentence describing the angle that would make someone click. It is not a script.
${UNTRUSTED_NOTE}
JSON shape: {"ideas":[{"title":"working video title","hook":"one sentence","angle":"what is new or different, 1-2 sentences","whyNow":"why publish this now, 1 sentence","audience":"who it is for","format":"tutorial|explainer|listicle|reaction|case-study|opinion|short","keywords":["search keywords"],"titleOptions":["2-3 alternative titles"],"priority":1,"sources":["S1"]}]}
priority is 1 (low) to 5 (publish first).`;
}

function userPrompt({ channel, memory, previous, research, options }) {
  const profile = memory.profile || {};
  const summary = memory.summary || {};
  const items = research.items.slice(0, 45);
  const lines = items.map((item, index) => `S${index + 1} [${item.type}] ${item.title}${item.snippet ? ` — ${item.snippet}` : ""}${item.date ? ` (${item.date})` : ""}`);
  const extracts = items
    .map((item, index) => (item.extract ? `S${index + 1}: ${item.extract}` : ""))
    .filter(Boolean)
    .join("\n\n");
  return [
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    `Channel: ${channel.name}${channel.handle ? ` (${channel.handle})` : ""}`,
    `Owner's description: ${profile.description || "(none)"}`,
    `Audience: ${summary.audience || profile.audience || "(unknown)"}`,
    `Goals: ${profile.goals || "(unknown)"}`,
    `Niche: ${summary.niche || "(unknown)"}`,
    `Style: ${summary.style || "(unknown)"}`,
    `Recurring themes: ${(summary.themes || []).join(", ") || "(unknown)"}`,
    `Topics not yet covered: ${(summary.gaps || []).join(", ") || "(unknown)"}`,
    options.focus ? `Focus for this run: ${options.focus}` : "",
    "",
    "Existing videos (from transcripts):",
    memoryDigestText(memory),
    "",
    "Already suggested, do NOT repeat or lightly reword:",
    previous.length ? previous.map((title) => `- ${title}`).join("\n") : "(none yet)",
    "",
    "Research found online right now:",
    untrusted("research", lines.join("\n") || "(nothing could be fetched this run; rely on the channel's own content)"),
    extracts ? `\nExtracts from some pages:\n${untrusted("pages", extracts)}` : "",
    "",
    `Give ${options.count} ideas, best first.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function cleanIdeas(raw, { items, previousTokens, runId, count }) {
  const list = Array.isArray(raw?.ideas) ? raw.ideas : Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = [...previousTokens];
  for (const row of list) {
    const title = clip(row?.title, 140);
    if (!title) continue;
    const tokens = titleTokens(title);
    if (seen.some((other) => similar(tokens, other) >= 0.6)) continue;
    seen.push(tokens);
    const sources = strings(row?.sources, 6, 8)
      .map((id) => items[Number(String(id).replace(/\D/g, "")) - 1])
      .filter(Boolean)
      .map((item) => ({ type: item.type, title: item.title, url: item.url, snippet: item.snippet, date: item.date || "" }));
    out.push({
      id: `${runId}-${out.length + 1}`,
      runId,
      title,
      hook: clip(row?.hook, 240),
      angle: clip(row?.angle, 420),
      whyNow: clip(row?.whyNow, 300),
      audience: clip(row?.audience, 200),
      format: FORMATS.has(row?.format) ? row.format : "explainer",
      keywords: strings(row?.keywords, 8, 40),
      titleOptions: strings(row?.titleOptions, 3, 140),
      priority: clamp(row?.priority, 1, 5, 3),
      sources: sources.filter((item, index, all) => all.findIndex((other) => other.url === item.url && other.title === item.title) === index),
      status: "new",
      createdAt: new Date().toISOString(),
    });
    if (out.length >= count) break;
  }
  return out;
}

// One run: channel memory + parallel research -> a model call -> new ideas saved as JSON.
export async function generateIdeas(slug, input = {}) {
  const options = ideasOptions(input);
  const channel = await getChannel(slug);
  if (!channel) throw fail("Channel not found", 404);
  let memory = await readMemory(slug);
  if (!memory || !Object.keys(memory.videos || {}).length) memory = (await buildMemory(slug, { model: options.model })).memory;

  const queries = buildQueries(memory, channel, options.focus, Number(loadConfig().ideas?.queries) || 3);
  const [research, previous] = await Promise.all([runResearch({ queries, sources: options.sources }), recentIdeaTitles(slug)]);
  const runId = `run-${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;

  const { data, model } = await chatJson({
    model: options.model,
    system: systemPrompt(),
    user: userPrompt({ channel, memory, previous, research, options }),
    maxTokens: 4500,
    temperature: 0.8,
    timeoutMs: 150_000,
  });

  const previousTokens = [...previous, ...Object.values(memory.videos).map((video) => video.title)].map(titleTokens);
  const ideas = cleanIdeas(data, { items: research.items.slice(0, 45), previousTokens, runId, count: options.count });
  if (!ideas.length) throw fail("The model did not return any usable new ideas. Run it again.", 502);

  const run = {
    id: runId,
    at: new Date().toISOString(),
    model,
    focus: options.focus,
    queries,
    sources: research.report,
    ideaCount: ideas.length,
  };
  await appendRun(slug, run, ideas);
  return { run, ideas };
}
