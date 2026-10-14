import "./env.js";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { channelDirectory } from "./storage.js";
import { fail, loadConfig } from "./utils.js";

// videos/<channel>/ideas/ideas.json      the newest runs (page 1) plus pinned ideas
// videos/<channel>/ideas/page-0001.json  older runs, RUNS_PER_PAGE runs per file (page 2 is the newest archive)
// Ideas you save or script are pinned in ideas.json and never trimmed.

const PINNED = new Set(["saved", "scripted"]);
const STATUSES = new Set(["new", "saved", "dismissed", "scripted"]);
const locks = new Map();

function runsPerPage() {
  return Number(loadConfig().ideas?.runsPerPage) || 5;
}

export function ideasDir(slug) {
  return path.join(channelDirectory(slug), "ideas");
}

function hotFile(slug) {
  return path.join(ideasDir(slug), "ideas.json");
}

function archiveFile(slug, index) {
  return path.join(ideasDir(slug), `page-${String(index).padStart(4, "0")}.json`);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(temp, file);
}

// One writer at a time per channel, so two runs finishing together cannot clobber each other.
export function withLock(slug, task) {
  const run = (locks.get(slug) || Promise.resolve()).then(task, task);
  locks.set(slug, run.then(() => undefined, () => undefined));
  return run;
}

function blank() {
  return { version: 1, runs: [], ideas: [], pinned: [], archivePages: 0 };
}

async function readHot(slug) {
  const data = await readJson(hotFile(slug), null);
  if (!data) return blank();
  return { ...blank(), ...data };
}

export async function readPage(slug, page = 1) {
  const hot = await readHot(slug);
  const total = 1 + hot.archivePages;
  const number = Math.max(1, Math.min(total, Number(page) || 1));
  if (number === 1) {
    const pinnedIds = new Set(hot.pinned.map((idea) => idea.id));
    return { page: 1, pages: total, runs: hot.runs, ideas: [...hot.ideas.filter((idea) => !pinnedIds.has(idea.id)), ...hot.pinned] };
  }
  const data = await readJson(archiveFile(slug, hot.archivePages - (number - 2)), { runs: [], ideas: [] });
  return { page: number, pages: total, runs: data.runs, ideas: data.ideas };
}

export async function recentIdeaTitles(slug, limit = 80) {
  const hot = await readHot(slug);
  const titles = [...hot.ideas, ...hot.pinned].map((idea) => idea.title);
  let index = hot.archivePages;
  while (titles.length < limit && index >= 1 && index > hot.archivePages - 2) {
    const data = await readJson(archiveFile(slug, index), { ideas: [] });
    titles.push(...data.ideas.map((idea) => idea.title));
    index -= 1;
  }
  return titles.slice(0, limit);
}

async function archiveRun(slug, hot, run, ideas) {
  const per = runsPerPage();
  let index = hot.archivePages;
  let page = index ? await readJson(archiveFile(slug, index), { runs: [], ideas: [] }) : { runs: [], ideas: [] };
  if (!index || page.runs.length >= per) {
    index += 1;
    page = { runs: [], ideas: [] };
  }
  page.runs.push(run);
  page.ideas.push(...ideas);
  await writeJson(archiveFile(slug, index), page);
  hot.archivePages = index;
}

// Adds a run and its ideas, then rotates the oldest runs out of the hot file.
export function appendRun(slug, run, ideas) {
  return withLock(slug, async () => {
    const hot = await readHot(slug);
    hot.runs.unshift(run);
    hot.ideas.unshift(...ideas);
    const per = runsPerPage();
    while (hot.runs.length > per) {
      const oldest = hot.runs.pop();
      const moving = hot.ideas.filter((idea) => idea.runId === oldest.id);
      hot.ideas = hot.ideas.filter((idea) => idea.runId !== oldest.id);
      const pinned = moving.filter((idea) => PINNED.has(idea.status));
      hot.pinned.push(...pinned.filter((idea) => !hot.pinned.some((item) => item.id === idea.id)));
      await archiveRun(slug, hot, oldest, moving.filter((idea) => !PINNED.has(idea.status)));
    }
    await writeJson(hotFile(slug), hot);
    return hot;
  });
}

export async function findIdea(slug, ideaId) {
  const hot = await readHot(slug);
  for (const idea of [...hot.pinned, ...hot.ideas]) if (idea.id === ideaId) return idea;
  for (let index = hot.archivePages; index >= 1; index -= 1) {
    const data = await readJson(archiveFile(slug, index), { ideas: [] });
    const found = data.ideas.find((idea) => idea.id === ideaId);
    if (found) return found;
  }
  return null;
}

// Applies a patch to an idea wherever it lives, and pins or unpins it as its status changes.
export function updateIdea(slug, ideaId, patch) {
  return withLock(slug, async () => {
    if (patch.status && !STATUSES.has(patch.status)) throw fail("Invalid status", 400);
    const hot = await readHot(slug);
    let idea = hot.ideas.find((item) => item.id === ideaId);
    let where = "hot";
    if (!idea) {
      idea = hot.pinned.find((item) => item.id === ideaId);
      where = "pinned";
    }
    let archiveIndex = 0;
    let archiveData = null;
    if (!idea) {
      for (let index = hot.archivePages; index >= 1 && !idea; index -= 1) {
        const data = await readJson(archiveFile(slug, index), { ideas: [] });
        const found = data.ideas.find((item) => item.id === ideaId);
        if (found) {
          idea = found;
          where = "archive";
          archiveIndex = index;
          archiveData = data;
        }
      }
    }
    if (!idea) return null;
    Object.assign(idea, patch, { updatedAt: new Date().toISOString() });
    const shouldPin = PINNED.has(idea.status);
    if (where === "archive" && shouldPin) {
      archiveData.ideas = archiveData.ideas.filter((item) => item.id !== ideaId);
      await writeJson(archiveFile(slug, archiveIndex), archiveData);
      hot.pinned.push(idea);
    } else if (where === "archive") {
      await writeJson(archiveFile(slug, archiveIndex), archiveData);
      return idea;
    } else if (where === "hot" && shouldPin) {
      /* stays in hot until its run rotates out, then moves to pinned */
    }
    await writeJson(hotFile(slug), hot);
    return idea;
  });
}

export async function ideaStats(slug) {
  const hot = await readHot(slug);
  const lastRun = hot.runs[0] || null;
  return { runs: hot.runs.length + hot.archivePages * runsPerPage(), pages: 1 + hot.archivePages, lastRunAt: lastRun?.at || null };
}

export async function deleteIdeas(slug) {
  await rm(ideasDir(slug), { recursive: true, force: true });
}
