import "./env.js";
import { fetchTranscript as fetchTranscriptRows, YoutubeTranscriptNotAvailableLanguageError } from "youtube-transcript-plus";
import { loadVideoPage, resolveVideo } from "./youtube.js";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

const MAX_TRANSCRIPT = 900_000;

function decodeXml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function rowsFromCaptionXml(xml) {
  const rows = [];
  const pattern = /<text[^>]*>([^<]*)<\/text>/g;
  let match;
  while ((match = pattern.exec(xml))) {
    const text = decodeXml(match[1]).replace(/\s+/g, " ").trim();
    if (text) rows.push(text);
  }
  return rows;
}

function json3ToText(data) {
  const events = Array.isArray(data?.events) ? data.events : [];
  const chunks = [];
  for (const event of events) {
    if (!Array.isArray(event.segs)) continue;
    chunks.push(event.segs.map((segment) => segment.utf8 || "").join(""));
  }
  return chunks;
}

function vttToText(raw) {
  return String(raw || "")
    .split("\n")
    .filter((line) => line && !line.startsWith("WEBVTT") && !/^\d+$/.test(line.trim()) && !line.includes("-->"))
    .map((line) => line.replace(/<[^>]+>/g, ""));
}

export function captionsToText(raw) {
  const body = String(raw || "").trim();
  let parts = [];
  if (!body) return "";
  if (body.startsWith("{") || body.startsWith("[")) {
    try {
      parts = json3ToText(JSON.parse(body));
    } catch {
      parts = [];
    }
  } else if (body.includes("<text")) {
    parts = rowsFromCaptionXml(body);
  } else if (body.startsWith("WEBVTT")) {
    parts = vttToText(body);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT);
}

function pickCaptionTrack(tracks) {
  const usable = (Array.isArray(tracks) ? tracks : []).filter((track) => track?.baseUrl);
  const rank = (track) => {
    const code = String(track.languageCode || "");
    const asr = track.kind === "asr" ? 1 : 0;
    if (code === "en" || code.startsWith("en-")) return asr;
    return 20 + asr;
  };
  usable.sort((a, b) => rank(a) - rank(b));
  return usable[0] || null;
}

function isRetryable(message) {
  const text = String(message || "").toLowerCase();
  return [
    "429",
    "too many requests",
    "recaptcha",
    "/sorry/",
    "timed out",
    "timeout",
    "network",
    "fetch failed",
    "econnreset",
    "enotfound",
  ].some((part) => text.includes(part));
}

async function downloadTrack(track) {
  const captionUrl = String(track.baseUrl || "").replace(/&fmt=[^&]+/, "");
  if (!captionUrl) throw new Error("Caption track has no URL");
  const response = await fetch(captionUrl, {
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": ANDROID_UA },
  });
  if (!response.ok) throw new Error(`Caption download HTTP ${response.status}`);
  const text = captionsToText(await response.text());
  if (!text) throw new Error("Caption track was empty");
  return { text, language: track.languageCode || (track.kind === "asr" ? "en" : "") };
}

async function captionsFromPlayer(player) {
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const track = pickCaptionTrack(tracks);
  if (!track) throw new Error("No caption tracks on the watch page");
  return downloadTrack(track);
}

async function captionsFromAndroid(videoId, apiKey) {
  if (!apiKey) throw new Error("Missing Innertube key for caption fallback");
  const response = await fetch(
    `https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ANDROID_UA,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
            hl: "en",
            gl: "US",
          },
        },
        videoId,
      }),
    },
  );
  if (!response.ok) throw new Error(`YouTube player HTTP ${response.status}`);
  const data = await response.json();
  const playable = data?.playabilityStatus?.status;
  if (playable && playable !== "OK") {
    throw new Error(data?.playabilityStatus?.reason || `Player status ${playable}`);
  }
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const track = pickCaptionTrack(tracks);
  if (!track) throw new Error("No caption tracks");
  return downloadTrack(track);
}

function textFromRows(rows, language) {
  const text = (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.text || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TRANSCRIPT);
  if (!text) throw new Error("Empty transcript");
  return { text, language: language || rows?.[0]?.lang || "" };
}

async function captionsFromLibrary(videoId) {
  try {
    return textFromRows(await fetchTranscriptRows(videoId, { lang: "en" }), "en");
  } catch (error) {
    if (error instanceof YoutubeTranscriptNotAvailableLanguageError || /language/i.test(error?.message || "")) {
      return textFromRows(await fetchTranscriptRows(videoId), "");
    }
    throw error;
  }
}

function result({ videoId, transcript, language, available, error, retryable, video }) {
  return {
    videoId,
    transcript: transcript || "",
    language: language || "",
    available: Boolean(available && transcript),
    error: error || "",
    retryable: Boolean(retryable),
    video,
  };
}

export async function fetchTranscript(input) {
  const { id } = resolveVideo(input);
  let page;
  try {
    page = await loadVideoPage(id);
  } catch (error) {
    const wrapped = new Error(error.message || "Could not load the YouTube video");
    wrapped.status = error.status || 502;
    throw wrapped;
  }

  const attempts = [];
  const methods = [
    () => captionsFromPlayer(page.player),
    () => captionsFromAndroid(id, page.apiKey),
    () => captionsFromLibrary(id),
  ];
  for (const method of methods) {
    try {
      const caption = await method();
      if (caption?.text) {
        return result({
          videoId: id,
          transcript: caption.text,
          language: caption.language,
          available: true,
          video: page.video,
        });
      }
    } catch (error) {
      attempts.push(error?.message || String(error));
    }
  }

  const error = attempts.filter(Boolean).join("; ") || "Transcript unavailable";
  return result({
    videoId: id,
    transcript: "",
    language: "",
    available: false,
    error,
    retryable: attempts.some(isRetryable),
    video: page.video,
  });
}
