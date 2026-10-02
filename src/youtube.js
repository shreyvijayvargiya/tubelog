import "./env.js";
import { fail, sleep } from "./utils.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const VIDEO_ID_RE =
  /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/;

const RESERVED = new Set([
  "watch",
  "shorts",
  "results",
  "feed",
  "playlist",
  "channel",
  "c",
  "user",
  "account",
  "premium",
  "upload",
  "live",
  "videos",
]);

export function parseVideoId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(raw) && !raw.startsWith("UC")) return raw;
  try {
    const url = new URL(raw);
    const fromQuery = url.searchParams.get("v");
    if (fromQuery && /^[A-Za-z0-9_-]{11}$/.test(fromQuery)) return fromQuery;
  } catch {
    /* not a URL */
  }
  const match = raw.match(VIDEO_ID_RE);
  return match?.[1] || "";
}

export function resolveVideo(input) {
  const id = parseVideoId(input);
  if (!id) throw fail("Could not resolve a YouTube video id from that input", 400);
  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}

export function resolveChannel(input) {
  const raw = String(input || "").trim();
  if (!raw) throw fail("Channel URL, @handle, or channel id is required", 400);
  if (parseVideoId(raw) && /youtu\.be|watch\?|shorts\/|embed\/|live\//i.test(raw)) {
    throw fail("That is a video URL. Add it as a video, or pass a channel URL.", 400);
  }
  if (/^UC[\w-]{20,}$/.test(raw)) {
    return { handle: "", channelId: raw, url: `https://www.youtube.com/channel/${raw}` };
  }
  const withScheme = /^https?:\/\//i.test(raw) ? raw : raw.includes("youtube.com") || raw.includes("youtu.be") ? `https://${raw.replace(/^\/\//, "")}` : "";
  if (withScheme) {
    let url;
    try {
      url = new URL(withScheme);
    } catch {
      throw fail("That channel URL is not valid", 400);
    }
    const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    if (parts[0] === "channel" && parts[1]?.startsWith("UC")) {
      return { handle: "", channelId: parts[1], url: `https://www.youtube.com/channel/${parts[1]}` };
    }
    if (parts[0]?.startsWith("@")) {
      const handle = parts[0].slice(1);
      if (!handle || RESERVED.has(handle.toLowerCase())) throw fail("That channel URL is not valid", 400);
      return { handle, channelId: "", url: `https://www.youtube.com/@${handle}` };
    }
    if ((parts[0] === "c" || parts[0] === "user") && parts[1]) {
      return { handle: parts[1], channelId: "", url: `https://www.youtube.com/@${parts[1]}` };
    }
    throw fail("Could not read a channel from that URL", 400);
  }
  const handle = raw.replace(/^@/, "").split("/")[0].trim();
  if (!handle || RESERVED.has(handle.toLowerCase()) || /[^A-Za-z0-9._-]/.test(handle)) {
    throw fail("Could not resolve that channel. Use a channel URL, @handle, or channel id.", 400);
  }
  return { handle, channelId: "", url: `https://www.youtube.com/@${handle}` };
}

export function videosPageUrl(channelUrl) {
  const resolved = resolveChannel(channelUrl);
  let base = String(resolved.url || "").replace(/\/+$/, "");
  base = base.replace(/\/(videos|shorts|streams|playlists|about|featured|community|posts)$/i, "");
  return `${base}/videos`;
}

export function parseDuration(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  if (match[3] != null) return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number(match[1]) * 60 + Number(match[2]);
}

function textOf(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node.simpleText === "string") return node.simpleText;
  if (typeof node.content === "string") return node.content;
  if (Array.isArray(node.runs)) return node.runs.map((row) => row?.text || "").join("");
  return "";
}

export function extractAssignedJson(html, varName) {
  const source = String(html || "");
  const match = source.match(new RegExp(`${varName}\\s*=\\s*\\{`));
  if (!match) return null;
  const start = source.indexOf(match[0]) + match[0].length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length && index < start + 4_000_000; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function thumbnailFor(videoId, thumbs) {
  const list = thumbs?.thumbnails || thumbs || [];
  if (Array.isArray(list) && list.length) {
    const last = list[list.length - 1];
    if (last?.url) return last.url;
  }
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";
}

function lengthFromOverlays(overlays) {
  if (!Array.isArray(overlays)) return "";
  for (const overlay of overlays) {
    const badge = overlay?.thumbnailOverlayTimeStatusRenderer;
    if (badge) return textOf(badge.text);
  }
  return "";
}

function isShort(node) {
  return JSON.stringify(node?.navigationEndpoint || node || "").includes("/shorts/");
}

function videoFromNode(node) {
  const renderer = node?.videoRenderer || node?.gridVideoRenderer || node?.playlistVideoRenderer;
  if (renderer?.videoId && !isShort(renderer)) {
    const lengthText = textOf(renderer.lengthText) || lengthFromOverlays(renderer.thumbnailOverlays);
    return {
      videoId: renderer.videoId,
      title: textOf(renderer.title) || `YouTube ${renderer.videoId}`,
      lengthText,
      durationSec: parseDuration(lengthText),
      publishedText: textOf(renderer.publishedTimeText),
      thumbnail: thumbnailFor(renderer.videoId, renderer.thumbnail),
      url: `https://www.youtube.com/watch?v=${renderer.videoId}`,
    };
  }

  const lock = node?.lockupViewModel;
  const videoId = lock?.contentId;
  if (!lock || !/^[A-Za-z0-9_-]{11}$/.test(videoId || "")) return null;
  const blob = JSON.stringify(lock);
  if (blob.includes("/shorts/")) return null;
  const title =
    lock.metadata?.lockupMetadataViewModel?.title?.content ||
    textOf(lock.metadata?.lockupMetadataViewModel?.title) ||
    `YouTube ${videoId}`;
  const lengthMatch = blob.match(/"text":"(\d{1,2}:\d{2}(?::\d{2})?)"/);
  const lengthText = lengthMatch?.[1] || "";
  return {
    videoId,
    title: typeof title === "string" ? title : `YouTube ${videoId}`,
    lengthText,
    durationSec: parseDuration(lengthText),
    publishedText: "",
    thumbnail: thumbnailFor(videoId),
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function continuationToken(node) {
  return node?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || "";
}

function walkGrid(nodes, acc, depth = 0) {
  if (!nodes || depth > 12) return;
  const list = Array.isArray(nodes) ? nodes : [nodes];
  for (const node of list) {
    if (!node || typeof node !== "object") continue;
    const video = videoFromNode(node);
    if (video) acc.videos.push(video);
    const token = continuationToken(node);
    if (token) acc.continuation = token;
    if (node.richItemRenderer?.content) walkGrid(node.richItemRenderer.content, acc, depth + 1);
    if (node.gridVideoRenderer) walkGrid({ videoRenderer: node.gridVideoRenderer }, acc, depth + 1);
    if (Array.isArray(node.contents)) walkGrid(node.contents, acc, depth + 1);
    if (Array.isArray(node.items)) walkGrid(node.items, acc, depth + 1);
  }
}

function gridContents(data) {
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  for (const tab of tabs) {
    const rich = tab?.tabRenderer?.content?.richGridRenderer?.contents;
    if (Array.isArray(rich) && rich.length) return rich;
    const section = tab?.tabRenderer?.content?.sectionListRenderer?.contents;
    if (Array.isArray(section) && section.length) return section;
  }
  const actions = data?.onResponseReceivedActions || [];
  for (const action of actions) {
    const items =
      action?.appendContinuationItemsAction?.continuationItems ||
      action?.reloadContinuationItemsCommand?.continuationItems;
    if (Array.isArray(items) && items.length) return items;
  }
  return [];
}

export function parseChannelVideosPayload(data) {
  const acc = { videos: [], continuation: "" };
  walkGrid(gridContents(data), acc);
  const seen = new Set();
  const videos = [];
  for (const video of acc.videos) {
    if (!video?.videoId || seen.has(video.videoId)) continue;
    seen.add(video.videoId);
    videos.push(video);
  }
  return { videos, continuation: acc.continuation || "" };
}

async function fetchHtml(url) {
  let response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (error) {
    throw fail(`Could not reach YouTube: ${error.message || "network error"}`, 502);
  }
  if (!response.ok) throw fail(`YouTube HTTP ${response.status}`, 502);
  return { html: await response.text(), url: response.url || url };
}

function handleFrom(meta, finalUrl, parsed) {
  const vanity = String(meta?.vanityChannelUrl || "");
  const fromVanity = vanity.match(/@([^/?#]+)/)?.[1];
  if (fromVanity) return decodeURIComponent(fromVanity);
  const fromFinal = String(finalUrl || "").match(/@([^/?#]+)/)?.[1];
  if (fromFinal) return decodeURIComponent(fromFinal);
  return parsed.handle || "";
}

function channelFromPage(data, html, finalUrl, parsed) {
  const meta = data?.metadata?.channelMetadataRenderer || {};
  const header = data?.header?.c4TabbedHeaderRenderer || {};
  const channelId =
    meta.externalId ||
    header.channelId ||
    String(html).match(/"externalId":"(UC[\w-]{20,})"/)?.[1] ||
    parsed.channelId ||
    "";
  const pageTitle = String(html.match(/<title>([^<]+)<\/title>/i)?.[1] || "")
    .replace(/\s*-\s*YouTube\s*$/i, "")
    .trim();
  const name = meta.title || textOf(header.title) || pageTitle || parsed.handle || "YouTube channel";
  const handle = handleFrom(meta, finalUrl, parsed);
  const avatar = meta.avatar?.thumbnails || [];
  const url = handle
    ? `https://www.youtube.com/@${handle}`
    : channelId
      ? `https://www.youtube.com/channel/${channelId}`
      : parsed.url;
  return {
    id: channelId,
    name: String(name).replace(/\s*-\s*YouTube\s*$/i, "").trim() || "YouTube channel",
    handle,
    url,
    description: typeof meta.description === "string" ? meta.description : "",
    thumbnail: avatar.length ? avatar[avatar.length - 1].url : "",
    apiKey: String(html).match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || "",
    clientVersion: String(html).match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || "2.20250901.01.00",
  };
}

function toVideo(raw, channel) {
  return {
    id: raw.videoId,
    title: raw.title,
    url: raw.url,
    channelId: channel?.id || "",
    channel: channel?.name || "",
    description: "",
    thumbnail: raw.thumbnail,
    publishedAt: raw.publishedText || "",
    duration: raw.durationSec ?? null,
  };
}

async function fetchChannelPage(channelUrl) {
  const parsed = resolveChannel(channelUrl);
  const pageUrl = videosPageUrl(parsed.url);
  const fetched = await fetchHtml(pageUrl);
  const data = extractAssignedJson(fetched.html, "ytInitialData");
  if (!data) throw fail("YouTube channel page had no video data", 502);
  const parsedVideos = parseChannelVideosPayload(data);
  const channel = channelFromPage(data, fetched.html, fetched.url, parsed);
  if (!channel.id && !channel.handle) {
    throw fail("YouTube did not return a channel id for that URL", 502);
  }
  return { ...parsedVideos, channel, url: fetched.url };
}

async function fetchContinuationPage({ continuation, apiKey, clientVersion }) {
  const endpoint = new URL("https://www.youtube.com/youtubei/v1/browse");
  endpoint.searchParams.set("prettyPrint", "false");
  if (apiKey) endpoint.searchParams.set("key", apiKey);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: clientVersion || "2.20250901.01.00",
            hl: "en",
            gl: "US",
          },
        },
        continuation,
      }),
    });
  } catch (error) {
    throw fail(`YouTube continuation failed: ${error.message || "network error"}`, 502);
  }
  if (!response.ok) throw fail(`YouTube continuation HTTP ${response.status}`, 502);
  const data = await response.json();
  return parseChannelVideosPayload(data);
}

export async function fetchChannel(input) {
  const page = await fetchChannelPage(input);
  return page.channel;
}

export async function listChannelVideos(channelInput, { maxVideos = 20, maxPages = 12, skipIds = new Set(), delayMs = 200 } = {}) {
  const first = await fetchChannelPage(typeof channelInput === "string" ? channelInput : channelInput.url || channelInput.handle || channelInput.id);
  const channel = { ...first.channel, ...(channelInput?.slug ? { slug: channelInput.slug } : {}) };
  const videos = [];
  let scanned = 0;
  let skipped = 0;
  let continuation = first.continuation || "";
  let pages = 1;
  let exhausted = !continuation;
  const seen = new Set();

  const consume = (rows) => {
    for (const raw of rows) {
      if (!raw?.videoId || seen.has(raw.videoId)) continue;
      seen.add(raw.videoId);
      scanned += 1;
      if (skipIds.has(raw.videoId)) {
        skipped += 1;
        continue;
      }
      videos.push(toVideo(raw, channel));
      if (videos.length >= maxVideos) return true;
    }
    return false;
  };

  if (consume(first.videos) || exhausted) {
    return { channel, videos, scanned, skipped, exhausted, pages };
  }

  while (pages < maxPages && videos.length < maxVideos && continuation) {
    await sleep(delayMs);
    const page = await fetchContinuationPage({
      continuation,
      apiKey: channel.apiKey,
      clientVersion: channel.clientVersion,
    });
    pages += 1;
    continuation = page.continuation || "";
    const full = consume(page.videos);
    if (full || !continuation || !page.videos.length) {
      exhausted = !continuation;
      break;
    }
  }

  return { channel, videos, scanned, skipped, exhausted: !continuation, pages };
}

export async function loadVideoPage(input) {
  const { id, url } = resolveVideo(input);
  const fetched = await fetchHtml(url);
  const player = extractAssignedJson(fetched.html, "ytInitialPlayerResponse") || {};
  const details = player.videoDetails || {};
  const micro = player.microformat?.playerMicroformatRenderer || {};
  const ownerUrl = micro.ownerProfileUrl || "";
  const description =
    details.shortDescription ||
    (typeof micro.description === "string" ? micro.description : textOf(micro.description)) ||
    "";
  const video = {
    id,
    title: details.title || textOf(micro.title) || `YouTube ${id}`,
    url,
    channelId: details.channelId || micro.externalChannelId || "",
    channel: details.author || micro.ownerChannelName || "",
    handle: String(ownerUrl).match(/@([^/?#]+)/)?.[1] || "",
    description,
    thumbnail: thumbnailFor(id, details.thumbnail?.thumbnails || micro.thumbnail?.thumbnails),
    publishedAt: String(micro.publishDate || micro.uploadDate || "").slice(0, 10),
    duration: Number(details.lengthSeconds || micro.lengthSeconds || 0) || null,
    channelUrl: ownerUrl
      ? (String(ownerUrl).startsWith("http") ? ownerUrl : `https://www.youtube.com${ownerUrl}`)
      : details.channelId
        ? `https://www.youtube.com/channel/${details.channelId}`
        : "",
  };
  return {
    video,
    player,
    apiKey: fetched.html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || "",
    playability: player.playabilityStatus?.status || "",
    reason: player.playabilityStatus?.reason || "",
  };
}

export async function fetchVideo(input) {
  const page = await loadVideoPage(input);
  if (!page.video.title) throw fail("YouTube did not return that video", 502);
  return page.video;
}

export function publicChannel(channel) {
  if (!channel) return null;
  return {
    id: channel.id || "",
    name: channel.name || "",
    handle: channel.handle || "",
    slug: channel.slug || "",
    url: channel.url || "",
    description: channel.description || "",
    thumbnail: channel.thumbnail || "",
    videoCount: channel.videoCount ?? 0,
    transcriptCount: channel.transcriptCount ?? 0,
    blogCount: channel.blogCount ?? 0,
    updatedAt: channel.updatedAt || channel.lastSyncedAt || null,
  };
}
