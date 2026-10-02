import "./env.js";
import { generateBlog } from "./ai.js";
import { fetchTranscript } from "./transcript.js";
import {
  ensureChannel,
  getChannel,
  listVideos,
  readVideo,
  touchChannel,
  videoIdsInChannel,
  writeVideo,
} from "./storage.js";
import { clamp, loadConfig, openRouterConfigured, sleep } from "./utils.js";
import { fetchChannel, listChannelVideos, publicChannel, resolveVideo } from "./youtube.js";

function report(onProgress, level, message) {
  if (typeof onProgress === "function") onProgress({ level, message });
}

function limits(options) {
  const config = loadConfig().sync;
  return {
    maxVideos: clamp(options.maxVideos, 1, 100, config.maxVideos || 20),
    maxPages: clamp(options.maxPages, 1, 30, config.maxPages || 12),
    delayMs: clamp(options.delayMs, 0, 5000, config.delayMs || 350),
  };
}

function mergeRecord(channel, listed, fetched, transcript) {
  const meta = fetched || {};
  const published = /^\d{4}-\d{2}-\d{2}/.test(meta.publishedAt || "") ? meta.publishedAt : listed?.publishedAt || meta.publishedAt || "";
  return {
    videoId: meta.id || listed?.id,
    channelId: channel.id || meta.channelId || "",
    channel: channel.name || meta.channel || "",
    channelSlug: channel.slug,
    title: meta.title || listed?.title || `YouTube ${meta.id || listed?.id}`,
    url: meta.url || listed?.url,
    thumbnail: meta.thumbnail || listed?.thumbnail || "",
    publishedAt: published,
    duration: meta.duration || listed?.duration || null,
    description: meta.description || listed?.description || "",
    transcriptAvailable: Boolean(transcript?.available),
    transcriptLanguage: transcript?.language || "",
    transcriptError: transcript?.available ? "" : transcript?.error || "",
    transcript: transcript?.transcript || "",
    blogGenerated: false,
    blog: "",
    blogModel: "",
    blogGeneratedAt: "",
  };
}

async function attachBlog(record, options, onProgress) {
  const blog = await generateBlog(record, options);
  record.blog = blog.markdown;
  record.blogGenerated = true;
  record.blogModel = blog.model;
  record.blogGeneratedAt = blog.generatedAt;
  await writeVideo(record);
  report(onProgress, "ok", `Blog generated: ${record.title}`);
  return record;
}

export async function archiveVideo(input, options = {}) {
  const { id } = resolveVideo(input);
  const existing = await readVideo(id);
  const transcript = await fetchTranscript(id);
  const meta = transcript.video || {};
  if (!transcript.available && transcript.retryable && !existing) {
    const error = new Error(transcript.error || "Transcript request was blocked");
    error.status = 502;
    throw error;
  }
  const channel = await ensureChannel({
    id: meta.channelId || existing?.channelId || "",
    name: meta.channel || existing?.channel || "YouTube",
    handle: meta.handle || "",
    url: meta.channelUrl || (meta.channelId ? `https://www.youtube.com/channel/${meta.channelId}` : ""),
    description: "",
    thumbnail: "",
  });
  const record = mergeRecord(channel, existing, { ...meta, id }, transcript);
  if (existing?.blogGenerated && !options.forceBlog) {
    record.blog = existing.blog;
    record.blogGenerated = existing.blogGenerated;
    record.blogModel = existing.blogModel;
    record.blogGeneratedAt = existing.blogGeneratedAt;
  }
  let saved = await writeVideo(record);
  if (options.generateBlog && saved.transcriptAvailable && (!saved.blogGenerated || options.forceBlog)) {
    if (!openRouterConfigured()) {
      const error = new Error("OPENROUTER_API_KEY is not set. The transcript was saved.");
      error.status = 400;
      error.video = saved;
      throw error;
    }
    saved = await attachBlog(saved, options, options.onProgress);
  }
  return saved;
}

export async function generateVideoBlog(input, options = {}) {
  const { id } = resolveVideo(input);
  let video = await readVideo(id);
  if (!video || !video.transcriptAvailable) {
    video = await archiveVideo(id, { generateBlog: false });
  }
  if (!video.transcriptAvailable) {
    const error = new Error(video.transcriptError || "Transcript unavailable, so a blog cannot be generated");
    error.status = 422;
    throw error;
  }
  return attachBlog(video, options, options.onProgress);
}

async function fillMissingBlogs(channel, options, budget, onProgress, skipIds = new Set()) {
  if (budget <= 0) return [];
  const local = await listVideos({ channelSlug: channel.slug });
  const results = [];
  for (const video of local) {
    if (results.length >= budget) break;
    if (skipIds.has(video.videoId)) continue;
    if (!video.transcriptAvailable || video.blogGenerated) continue;
    try {
      await attachBlog(video, options, onProgress);
      results.push({
        id: video.videoId,
        title: video.title,
        url: video.url,
        action: "blog",
        transcriptAvailable: true,
        blogGenerated: true,
        error: "",
      });
    } catch (error) {
      report(onProgress, "warn", `Skipping blog: ${video.title} — ${error.message}`);
      results.push({
        id: video.videoId,
        title: video.title,
        url: video.url,
        action: "failed",
        transcriptAvailable: true,
        blogGenerated: false,
        error: error.message,
      });
      if (error.status === 400 && /OPENROUTER_API_KEY/.test(error.message)) break;
    }
  }
  return results;
}

let syncQueue = Promise.resolve();

async function syncChannelNow(channelInput, options = {}) {
  const { maxVideos, maxPages, delayMs } = limits(options);
  const generateBlogFlag = options.generateBlog === true;
  const force = options.force === true;
  const onProgress = options.onProgress;
  if (generateBlogFlag && !openRouterConfigured()) {
    report(onProgress, "warn", "OPENROUTER_API_KEY is not set. Transcripts will be saved and blogs will be skipped.");
  }
  const canBlog = generateBlogFlag && openRouterConfigured();

  const resolved = await fetchChannel(channelInput);
  const channel = await ensureChannel({
    id: resolved.id,
    name: resolved.name,
    handle: resolved.handle,
    url: resolved.url,
    description: resolved.description,
    thumbnail: resolved.thumbnail,
  });
  report(onProgress, "ok", `Channel resolved: ${channel.name}`);

  const skipIds = force ? new Set() : await videoIdsInChannel(channel.slug);
  const listed = await listChannelVideos(channel.url, { maxVideos, maxPages, skipIds, delayMs });
  report(onProgress, "ok", `Found ${listed.scanned} videos`);
  report(onProgress, "ok", `Already archived: ${listed.skipped}`);
  report(onProgress, "info", `Processing: ${listed.videos.length} new videos`);

  const videos = [];
  const blogTried = new Set();
  let saved = 0;
  let failed = 0;
  let blogsGenerated = 0;

  for (const item of listed.videos) {
    report(onProgress, "info", `Processing: ${item.title}`);
    try {
      const transcript = await fetchTranscript(item.id);
      if (!transcript.available && transcript.retryable) {
        failed += 1;
        report(onProgress, "warn", `Skipping video: ${item.title} — ${transcript.error || "request blocked"}`);
        videos.push({
          id: item.id,
          title: item.title,
          url: item.url,
          action: "failed",
          transcriptAvailable: false,
          blogGenerated: false,
          error: transcript.error || "Transcript request was blocked",
        });
        await sleep(delayMs);
        continue;
      }
      const existing = force ? await readVideo(item.id) : null;
      const record = mergeRecord(channel, item, transcript.video, transcript);
      if (existing?.blogGenerated && !canBlog) {
        record.blog = existing.blog;
        record.blogGenerated = true;
        record.blogModel = existing.blogModel;
        record.blogGeneratedAt = existing.blogGeneratedAt;
      }
      let stored = await writeVideo(record);
      saved += 1;
      if (stored.transcriptAvailable) report(onProgress, "ok", `Transcript saved: ${stored.title}`);
      else report(onProgress, "warn", `Transcript unavailable: ${stored.title}`);

      if (canBlog && stored.transcriptAvailable && (!stored.blogGenerated || force)) {
        blogTried.add(stored.videoId);
        try {
          stored = await attachBlog(stored, options, onProgress);
          blogsGenerated += 1;
        } catch (error) {
          report(onProgress, "warn", `Blog failed: ${stored.title} — ${error.message}`);
        }
      }
      videos.push({
        id: stored.videoId,
        title: stored.title,
        url: stored.url,
        action: "saved",
        transcriptAvailable: stored.transcriptAvailable,
        blogGenerated: stored.blogGenerated,
        error: stored.transcriptError || "",
      });
    } catch (error) {
      failed += 1;
      report(onProgress, "warn", `Skipping video: ${item.title} — ${error.message}`);
      videos.push({
        id: item.id,
        title: item.title,
        url: item.url,
        action: "failed",
        transcriptAvailable: false,
        blogGenerated: false,
        error: error.message || "Failed",
      });
    }
    await sleep(delayMs);
  }

  const blogBudget = canBlog ? Math.max(0, maxVideos - blogsGenerated) : 0;
  const filled = await fillMissingBlogs(channel, options, blogBudget, onProgress, blogTried);
  blogsGenerated += filled.filter((row) => row.action === "blog").length;
  failed += filled.filter((row) => row.action === "failed").length;
  videos.push(...filled);

  await touchChannel(channel.slug);
  const fresh = await getChannel(channel.slug);
  return {
    channel: publicChannel(fresh),
    found: listed.scanned,
    alreadyArchived: listed.skipped,
    processed: listed.videos.length,
    saved,
    blogsGenerated,
    failed,
    exhausted: listed.exhausted,
    videos,
  };
}

export function syncChannel(channelInput, options = {}) {
  const run = syncQueue.then(() => syncChannelNow(channelInput, options));
  syncQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
