import "./env.js";
import { ideaStats } from "./ideas-store.js";
import { buildMemory, readMemory } from "./memory.js";
import { syncChannel } from "./sync.js";
import { ensureChannel, getChannel, listChannels, updateChannelMeta } from "./storage.js";
import { fail, openRouterConfigured } from "./utils.js";
import { fetchChannel, publicChannel } from "./youtube.js";

const clip = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

async function view(channel) {
  const memory = await readMemory(channel.slug);
  const ideas = await ideaStats(channel.slug);
  return {
    ...publicChannel(channel),
    mine: Boolean(channel.mine),
    profile: { description: "", audience: "", goals: "", ...(channel.profile || {}) },
    memory: memory ? { updatedAt: memory.updatedAt || null, videos: memory.videoCount || Object.keys(memory.videos || {}).length, niche: memory.summary?.niche || "", themes: memory.summary?.themes || [] } : null,
    ideas,
  };
}

export async function listMyChannels() {
  const mine = (await listChannels()).filter((channel) => channel.mine);
  return Promise.all(mine.map(view));
}

export async function getMyChannel(slug) {
  const channel = await getChannel(slug);
  if (!channel?.mine) return null;
  return view(channel);
}

// Marks a channel as yours (from a URL or from one already in the library), saves the description you
// wrote, pulls its videos and transcripts, then builds the memory the ideas agent reads.
export async function addMyChannel(input = {}) {
  const profile = { description: clip(input.description, 1200), audience: clip(input.audience, 300), goals: clip(input.goals, 300) };
  const warnings = [];
  let slug = "";
  let url = "";
  if (input.channel) {
    const existing = await getChannel(String(input.channel));
    if (!existing) throw fail("Channel not found in your library", 404);
    slug = existing.slug;
    url = existing.url;
  } else {
    const query = String(input.url || "").trim();
    if (!query) throw fail("Give a YouTube channel URL or pick a saved channel", 400);
    const resolved = await fetchChannel(query);
    const saved = await ensureChannel({ id: resolved.id, name: resolved.name, handle: resolved.handle, url: resolved.url, description: resolved.description, thumbnail: resolved.thumbnail });
    slug = saved.slug;
    url = saved.url || query;
  }
  await updateChannelMeta(slug, { mine: true, profile });

  let sync = null;
  if (input.sync !== false) {
    try {
      const result = await syncChannel(url, { maxVideos: input.maxVideos });
      sync = { found: result.found, saved: result.saved, failed: result.failed, alreadyArchived: result.alreadyArchived };
    } catch (error) {
      warnings.push(`Could not sync videos: ${error.message}`);
    }
  }

  let memory = null;
  if (input.memory !== false) {
    try {
      const built = await buildMemory(slug, { model: input.model });
      memory = { videos: built.memory.videoCount, digested: built.digested, usedLlm: built.usedLlm };
      if (!openRouterConfigured()) warnings.push("No OPENROUTER_API_KEY: memory was built with a simple keyword summary. Add a key and rebuild for better digests.");
    } catch (error) {
      warnings.push(`Memory not built: ${error.message}`);
    }
  }
  return { channel: await view(await getChannel(slug)), sync, memory, warnings };
}

export async function rebuildMemory(slug, input = {}) {
  const channel = await getChannel(slug);
  if (!channel?.mine) throw fail("Not one of your channels", 404);
  let sync = null;
  if (input.sync === true && channel.url) {
    const result = await syncChannel(channel.url, { maxVideos: input.maxVideos });
    sync = { found: result.found, saved: result.saved, failed: result.failed, alreadyArchived: result.alreadyArchived };
  }
  const built = await buildMemory(slug, { model: input.model, force: input.force === true });
  return { channel: await view(await getChannel(slug)), sync, memory: { videos: built.memory.videoCount, digested: built.digested, usedLlm: built.usedLlm } };
}

export async function removeMyChannel(slug) {
  const channel = await getChannel(slug);
  if (!channel?.mine) throw fail("Not one of your channels", 404);
  await updateChannelMeta(slug, { mine: false });
  return { slug, mine: false };
}
