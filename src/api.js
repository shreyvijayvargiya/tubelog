import "./env.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { blogOptions } from "./ai.js";
import { generateInstagram } from "./instagram.js";
import { archiveVideo, generateVideoBlog, syncChannel } from "./sync.js";
import {
  deleteVideo,
  detail,
  ensureChannel,
  getChannel,
  listChannels,
  listVideos,
  publicInstagram,
  readInstagram,
  readInstagramSlide,
  readVideo,
  searchVideos,
  summarize,
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
    sync: {
      maxVideos: config.sync.maxVideos,
      maxPages: config.sync.maxPages,
    },
  });
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

app.get("/api/videos/:id", async (c) => {
  const video = await readVideo(c.req.param("id"));
  if (!video) return c.json({ error: "Video not found" }, 404);
  const record = await readInstagram(video.channelSlug, video.videoId);
  return c.json({
    video: {
      ...detail(video, { updatedAt: video.updatedAt }),
      instagram: publicInstagram(video.videoId, record),
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
