import "./env.js";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { blogOptions } from "./ai.js";
import { generateInstagram } from "./instagram.js";
import { archiveVideo, generateVideoBlog, syncChannel } from "./sync.js";
import { generateTranslation } from "./translate.js";
import { generateIdeas } from "./ideas.js";
import { deleteGenerated, generatedFile, generateVideo, listGenerated, listVideoModels, publicVideo, readMeta } from "./studio.js";
import { findIdea, ideasDir, readPage, updateIdea } from "./ideas-store.js";
import { addMyChannel, getMyChannel, listMyChannels, rebuildMemory, removeMyChannel } from "./mychannels.js";
import { ideaFileName, produceIdea } from "./produce.js";
import { SOURCE_NAMES } from "./research.js";
import {
  deleteVideo,
  detail,
  ensureChannel,
  getChannel,
  listChannels,
  listVideos,
  publicInstagram,
  publicTranslations,
  readInstagram,
  readInstagramSlide,
  readVideo,
  searchVideos,
  summarize,
  translationFile,
} from "./storage.js";
import { fail, loadConfig, openRouterConfigured, plainExcerpt } from "./utils.js";
import { fetchChannel, publicChannel, resolveVideo } from "./youtube.js";

export const app = new Hono();

app.use("*", cors());

app.onError((error, c) => {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error(error);
  else console.error(`[tubelog] ${status} ${error.message}`);
  return c.json({ error: error.message || "Request failed" }, status);
});

async function readJson(c) {
  try {
    return await c.req.json();
  } catch {
    throw fail("Invalid JSON body", 400);
  }
}

function blogBody(body = {}) {
  return blogOptions({
    model: body.model,
    style: body.style,
    language: body.language,
    includeTakeaways: body.includeTakeaways,
    includeOriginalVideo: body.includeOriginalVideo,
    includeCodeExamples: body.includeCodeExamples,
  });
}

// Streams a file with HTTP Range support so browsers can seek in audio and video.
function streamFile(c, found) {
  const headers = { "Content-Type": found.type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=300" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("range") || "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, found.size - Number(range[2]));
    const end = Math.min(range[1] && range[2] ? Number(range[2]) : found.size - 1, found.size - 1);
    if (start > end || start >= found.size) {
      return c.body(null, 416, { ...headers, "Content-Range": `bytes */${found.size}` });
    }
    return c.body(Readable.toWeb(createReadStream(found.file, { start, end })), 206, {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${found.size}`,
      "Content-Length": String(end - start + 1),
    });
  }
  return c.body(Readable.toWeb(createReadStream(found.file)), 200, { ...headers, "Content-Length": String(found.size) });
}

app.get("/api/health", (c) => c.json({ ok: true, service: "tubelog" }));

app.get("/api/config", (c) => {
  const config = loadConfig();
  return c.json({
    github: config.github,
    videosDir: config.videosDir,
    openRouter: { configured: openRouterConfigured() },
    ai: {
      enabled: Boolean(config.ai.enabled),
      model: config.ai.model,
      models: config.ai.models,
    },
    blog: config.blog,
    instagram: {
      imageModel: config.instagram?.imageModel || "",
      imageModels: config.instagram?.imageModels || [],
      themes: (config.instagram?.themes || []).map((theme) => ({
        id: theme.id,
        label: theme.label,
        hook: theme.hook,
      })),
    },
    translation: {
      voice: config.translation?.voice || "",
      voices: config.translation?.voices || [],
      languages: config.translation?.languages || [],
      ttsModel: process.env.OPENROUTER_TTS_MODEL?.trim() || config.translation?.ttsModel || "",
    },
    studio: {
      maxSeconds: config.studio?.maxSeconds || 12,
      models: config.studio?.models || [],
    },
    ideas: {
      count: config.ideas?.count || 8,
      sources: SOURCE_NAMES,
      tavily: Boolean(process.env.TAVILY_API_KEY?.trim()),
      brave: Boolean(process.env.BRAVE_API_KEY?.trim()),
    },
    sync: {
      maxVideos: config.sync.maxVideos,
      maxPages: config.sync.maxPages,
    },
  });
});


function publicIdea(slug, idea) {
  return { ...idea, channelSlug: slug };
}

async function ownChannel(slug) {
  const channel = await getMyChannel(slug);
  if (!channel) throw fail("Not one of your channels", 404);
  return channel;
}

app.get("/api/my-channels", async (c) => c.json({ channels: await listMyChannels() }));

app.post("/api/my-channels", async (c) => {
  const body = await readJson(c);
  return c.json(
    await addMyChannel({
      url: body.url,
      channel: body.channel,
      description: body.description,
      audience: body.audience,
      goals: body.goals,
      maxVideos: body.maxVideos,
      sync: body.sync,
      memory: body.memory,
      model: body.model,
    }),
  );
});

app.post("/api/my-channels/:slug/memory", async (c) => {
  const body = await readJson(c).catch(() => ({}));
  return c.json(await rebuildMemory(c.req.param("slug"), body && typeof body === "object" ? body : {}));
});

app.delete("/api/my-channels/:slug", async (c) => c.json(await removeMyChannel(c.req.param("slug"))));

app.post("/api/ai/ideas", async (c) => {
  const body = await readJson(c);
  const slug = body.channel;
  if (!slug) throw fail("channel is required", 400);
  await ownChannel(slug);
  const result = await generateIdeas(slug, { focus: body.focus, count: body.count, model: body.model, sources: body.sources });
  return c.json({ channelSlug: slug, run: result.run, ideas: result.ideas.map((idea) => publicIdea(slug, idea)) });
});

app.get("/api/channels/:slug/ideas", async (c) => {
  const slug = c.req.param("slug");
  await ownChannel(slug);
  const page = await readPage(slug, c.req.query("page"));
  return c.json({ channelSlug: slug, page: page.page, pages: page.pages, runs: page.runs, ideas: page.ideas.map((idea) => publicIdea(slug, idea)) });
});

app.get("/api/channels/:slug/ideas/:ideaId", async (c) => {
  const slug = c.req.param("slug");
  await ownChannel(slug);
  const idea = await findIdea(slug, c.req.param("ideaId"));
  if (!idea) return c.json({ error: "Idea not found" }, 404);
  return c.json({ idea: publicIdea(slug, idea) });
});

app.patch("/api/channels/:slug/ideas/:ideaId", async (c) => {
  const slug = c.req.param("slug");
  await ownChannel(slug);
  const body = await readJson(c);
  const idea = await updateIdea(slug, c.req.param("ideaId"), { status: body.status });
  if (!idea) return c.json({ error: "Idea not found" }, 404);
  return c.json({ idea: publicIdea(slug, idea) });
});

app.post("/api/channels/:slug/ideas/:ideaId/produce", async (c) => {
  const slug = c.req.param("slug");
  await ownChannel(slug);
  const body = await readJson(c).catch(() => ({}));
  const idea = await findIdea(slug, c.req.param("ideaId"));
  if (!idea) return c.json({ error: "Idea not found" }, 404);
  const result = await produceIdea(slug, idea, body && typeof body === "object" ? body : {});
  return c.json({ idea: publicIdea(slug, result.idea), errors: result.errors });
});

app.get("/api/channels/:slug/ideas/:ideaId/files/:name", async (c) => {
  const slug = c.req.param("slug");
  await ownChannel(slug);
  const name = ideaFileName(c.req.param("name"));
  const idea = await findIdea(slug, c.req.param("ideaId"));
  if (!name || !idea) return c.json({ error: "File not found" }, 404);
  try {
    const body = await readFile(path.join(ideasDir(slug), idea.id, name));
    const type = name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return c.body(body, 200, { "Content-Type": type, "Cache-Control": "private, max-age=3600" });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

app.get("/api/studio/models", async (c) => c.json({ models: await listVideoModels({ force: c.req.query("refresh") === "1" }) }));

app.post("/api/ai/video", async (c) => {
  const body = await readJson(c);
  const video = await generateVideo({
    prompt: body.prompt,
    model: body.model,
    duration: body.duration,
    resolution: body.resolution,
    aspectRatio: body.aspectRatio,
    refine: body.refine,
    refineModel: body.refineModel,
  });
  return c.json({ video });
});

app.get("/api/studio/videos", async (c) => c.json({ videos: await listGenerated() }));

app.get("/api/studio/videos/:id", async (c) => {
  const meta = await readMeta(c.req.param("id"));
  if (!meta) return c.json({ error: "Video not found" }, 404);
  return c.json({ video: publicVideo(meta) });
});

app.get("/api/studio/videos/:id/file", async (c) => {
  const found = await generatedFile(c.req.param("id"));
  if (!found) return c.json({ error: "Video file not found" }, 404);
  return streamFile(c, found);
});

app.delete("/api/studio/videos/:id", async (c) => {
  const id = c.req.param("id");
  if (!(await deleteGenerated(id))) return c.json({ error: "Video not found" }, 404);
  return c.json({ deleted: true, id });
});

app.get("/api/channels", async (c) => {
  const channels = await listChannels();
  return c.json({ channels: channels.map(publicChannel) });
});

app.get("/api/channels/:channel", async (c) => {
  const channel = await getChannel(c.req.param("channel"));
  if (!channel) return c.json({ error: "Channel not found" }, 404);
  const videos = await listVideos({ channelSlug: channel.slug });
  return c.json({
    channel: publicChannel(channel),
    videos: videos.map((video) => summarize(video, { updatedAt: video.updatedAt })),
  });
});

app.get("/api/videos", async (c) => {
  const channel = c.req.query("channel") || "";
  const blogsOnly = c.req.query("blog") === "generated";
  const videos = await listVideos({ channelSlug: channel, blogsOnly });
  return c.json({
    videos: videos.map((video) =>
      summarize(video, {
        updatedAt: video.updatedAt,
        excerpt: blogsOnly ? plainExcerpt(video.blog) : "",
      }),
    ),
  });
});

app.get("/api/videos/:id/transcript", async (c) => {
  const video = await readVideo(c.req.param("id"));
  if (!video) return c.json({ error: "Video not found" }, 404);
  return c.json({
    videoId: video.videoId,
    transcript: video.transcript,
    language: video.transcriptLanguage,
    available: video.transcriptAvailable,
  });
});

app.get("/api/videos/:id/blog", async (c) => {
  const video = await readVideo(c.req.param("id"));
  if (!video) return c.json({ error: "Video not found" }, 404);
  return c.json({
    videoId: video.videoId,
    blog: video.blog,
    generated: video.blogGenerated,
    model: video.blogModel,
    generatedAt: video.blogGeneratedAt,
  });
});

app.get("/api/videos/:id/markdown", async (c) => {
  const video = await readVideo(c.req.param("id"));
  if (!video) return c.json({ error: "Video not found" }, 404);
  return c.body(video.markdown, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": `inline; filename="${video.videoId}.md"`,
  });
});

app.get("/api/videos/:id/instagram/:index", async (c) => {
  const video = await readVideo(c.req.param("id"));
  if (!video) return c.json({ error: "Video not found" }, 404);
  const slide = await readInstagramSlide(video.channelSlug, video.videoId, c.req.param("index"));
  if (!slide) return c.json({ error: "Slide not found" }, 404);
  return c.body(slide.body, 200, {
    "Content-Type": slide.type,
    "Cache-Control": "private, max-age=3600",
  });
});

app.get("/api/videos/:id/instagram", async (c) => {
  const video = await readVideo(c.req.param("id"));
  if (!video) return c.json({ error: "Video not found" }, 404);
  const record = await readInstagram(video.channelSlug, video.videoId);
  return c.json({ videoId: video.videoId, instagram: publicInstagram(video.videoId, record) });
});

app.get("/api/videos/:id/translations", async (c) => {
  const video = await readVideo(c.req.param("id"));
  if (!video) return c.json({ error: "Video not found" }, 404);
  return c.json({ videoId: video.videoId, translations: await publicTranslations(video.channelSlug, video.videoId) });
});

app.get("/api/videos/:id/translations/:lang/:kind", async (c) => {
  const video = await readVideo(c.req.param("id"));
  if (!video) return c.json({ error: "Video not found" }, 404);
  const found = await translationFile(video.channelSlug, video.videoId, c.req.param("lang"), c.req.param("kind"));
  if (!found) return c.json({ error: "Translation file not found" }, 404);
  return streamFile(c, found);
});

app.get("/api/videos/:id", async (c) => {
  const video = await readVideo(c.req.param("id"));
  if (!video) return c.json({ error: "Video not found" }, 404);
  const record = await readInstagram(video.channelSlug, video.videoId);
  return c.json({
    video: {
      ...detail(video, { updatedAt: video.updatedAt }),
      instagram: publicInstagram(video.videoId, record),
      translations: await publicTranslations(video.channelSlug, video.videoId),
    },
  });
});

app.get("/api/search", async (c) => {
  const query = c.req.query("q") || "";
  const channel = c.req.query("channel") || "";
  const results = await searchVideos(query, { channelSlug: channel });
  return c.json({ query, results });
});

app.post("/api/youtube/channel", async (c) => {
  const body = await readJson(c);
  const query = body.query || body.channel || body.url;
  const resolved = await fetchChannel(query);
  const saved = await ensureChannel({
    id: resolved.id,
    name: resolved.name,
    handle: resolved.handle,
    url: resolved.url,
    description: resolved.description,
    thumbnail: resolved.thumbnail,
  });
  const channel = await getChannel(saved.slug);
  return c.json({ channel: publicChannel(channel) });
});

app.post("/api/youtube/transcript", async (c) => {
  const body = await readJson(c);
  if (!body.video) throw fail("video is required", 400);
  try {
    const video = await archiveVideo(body.video, {
      generateBlog: body.generateBlog === true,
      ...(body.generateBlog === true ? blogBody(body) : {}),
    });
    return c.json({
      videoId: video.videoId,
      title: video.title,
      url: video.url,
      transcript: video.transcript,
      language: video.transcriptLanguage,
      available: video.transcriptAvailable,
      saved: true,
      blogGenerated: video.blogGenerated,
      channel: video.channel,
      channelSlug: video.channelSlug,
    });
  } catch (error) {
    if (error.video) {
      return c.json(
        {
          error: error.message,
          saved: true,
          videoId: error.video.videoId,
          title: error.video.title,
          url: error.video.url,
          transcript: error.video.transcript,
        },
        error.status || 400,
      );
    }
    throw error;
  }
});

app.post("/api/youtube/sync", async (c) => {
  const body = await readJson(c);
  const channel = body.channel || body.query || body.url;
  if (!channel) throw fail("channel is required", 400);
  const result = await syncChannel(channel, {
    generateBlog: body.generateBlog === true,
    force: body.force === true,
    maxVideos: body.maxVideos,
    ...(body.generateBlog === true ? blogBody(body) : {}),
  });
  return c.json(result);
});

app.post("/api/ai/blog", async (c) => {
  const body = await readJson(c);
  if (!body.video) throw fail("video is required", 400);
  const video = await generateVideoBlog(body.video, blogBody(body));
  return c.json({
    videoId: video.videoId,
    title: video.title,
    url: video.url,
    blog: video.blog,
    model: video.blogModel,
    generatedAt: video.blogGeneratedAt,
    channel: video.channel,
    channelSlug: video.channelSlug,
  });
});

app.post("/api/ai/instagram", async (c) => {
  const body = await readJson(c);
  if (!body.video) throw fail("video is required", 400);
  const { id } = resolveVideo(body.video);
  let video = await readVideo(id);
  if (!video || !video.transcriptAvailable) {
    video = await archiveVideo(id, { generateBlog: false });
  }
  if (!video.transcriptAvailable) {
    throw fail(video.transcriptError || "Transcript unavailable, so an Instagram carousel cannot be created", 422);
  }
  const saved = await generateInstagram(video, {
    theme: body.theme,
    model: body.model,
    imageModel: body.imageModel,
    language: body.language,
  });
  return c.json({
    videoId: video.videoId,
    title: video.title,
    url: video.url,
    channel: video.channel,
    channelSlug: video.channelSlug,
    instagram: publicInstagram(video.videoId, saved),
  });
});

app.post("/api/ai/translate", async (c) => {
  const body = await readJson(c);
  if (!body.video) throw fail("video is required", 400);
  const { id } = resolveVideo(body.video);
  let video = await readVideo(id);
  if (!video || !video.transcriptAvailable) {
    video = await archiveVideo(id, { generateBlog: false });
  }
  if (!video.transcriptAvailable) {
    throw fail(video.transcriptError || "Transcript unavailable, so it cannot be translated", 422);
  }
  const translation = await generateTranslation(video, {
    language: body.language,
    voice: body.voice,
    model: body.model,
    ttsModel: body.ttsModel,
    replaceAudio: body.replaceAudio,
    videoUrl: body.videoUrl,
  });
  return c.json({
    videoId: video.videoId,
    title: video.title,
    url: video.url,
    channel: video.channel,
    channelSlug: video.channelSlug,
    translation,
  });
});

app.post("/api/videos/:id/regenerate", async (c) => {
  const body = await readJson(c).catch(() => ({}));
  resolveVideo(c.req.param("id"));
  const video = await generateVideoBlog(c.req.param("id"), blogBody(body && typeof body === "object" ? body : {}));
  return c.json({
    videoId: video.videoId,
    title: video.title,
    url: video.url,
    blog: video.blog,
    model: video.blogModel,
    generatedAt: video.blogGeneratedAt,
  });
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api")) return c.json({ error: "Not found" }, 404);
  return c.json({ error: "Not found" }, 404);
});

app.delete("/api/videos/:id", async (c) => {
  const id = c.req.param("id");
  resolveVideo(id);
  const deleted = await deleteVideo(id);
  if (!deleted) return c.json({ error: "Video not found" }, 404);
  return c.json({ deleted: true, videoId: id });
});
