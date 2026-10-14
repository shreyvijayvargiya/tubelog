import "./env.js";
import { extractAssignedJson } from "./youtube.js";
import { assertPublicUrl } from "./translate.js";
import { loadConfig } from "./utils.js";

// Every source runs at the same time with its own timeout. A failing source never fails the run.

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 TubeLog/0.1";
const clip = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

function decodeEntities(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

const stripTags = (html) => decodeEntities(String(html || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

async function get(url, { timeoutMs = 9000, headers = {}, json = false, maxBytes = 600_000 } = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow", headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...headers } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (json) return response.json();
  const text = await response.text();
  return text.length > maxBytes ? text.slice(0, maxBytes) : text;
}

function rssItems(xml, limit = 10) {
  const items = [];
  for (const block of String(xml).split(/<item[\s>]/i).slice(1, limit + 1)) {
    const tag = (name) => decodeEntities(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] || "").trim();
    items.push({ title: stripTags(tag("title")), url: tag("link"), date: tag("pubDate"), snippet: clip(stripTags(tag("description")), 220), traffic: tag("ht:approx_traffic") });
  }
  return items.filter((item) => item.title);
}

const SOURCES = {
  async news(query) {
    const xml = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:14d`)}&hl=en-US&gl=US&ceid=US:en`);
    return rssItems(xml, 8).map((item) => ({ type: "news", title: item.title, url: item.url, date: item.date, snippet: item.snippet, scrapeable: false }));
  },
  async hackernews(query) {
    const since = Math.floor(Date.now() / 1000) - 21 * 86400;
    const data = await get(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=8`, { json: true });
    return (data.hits || [])
      .filter((hit) => hit.title)
      .map((hit) => ({ type: "hackernews", title: hit.title, url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`, date: hit.created_at, snippet: `${hit.points || 0} points, ${hit.num_comments || 0} comments`, scrapeable: Boolean(hit.url) }));
  },
  async trends() {
    const geo = String(loadConfig().ideas?.geo || "US").toUpperCase().replace(/[^A-Z-]/g, "").slice(0, 5) || "US";
    const xml = await get(`https://trends.google.com/trending/rss?geo=${geo}`);
    return rssItems(xml, 15).map((item) => ({ type: "trends", title: item.title, url: item.url || `https://trends.google.com/trending?geo=${geo}`, date: item.date, snippet: item.traffic ? `${item.traffic} searches` : "", scrapeable: false }));
  },
  async youtube(query) {
    const html = await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=CAISAhAB`, { maxBytes: 3_000_000 });
    const data = extractAssignedJson(html, "ytInitialData");
    const out = [];
    const walk = (node, depth = 0) => {
      if (!node || typeof node !== "object" || depth > 14 || out.length >= 10) return;
      if (node.videoRenderer?.videoId) {
        const renderer = node.videoRenderer;
        out.push({
          type: "youtube",
          title: renderer.title?.runs?.map((run) => run.text).join("") || "",
          url: `https://www.youtube.com/watch?v=${renderer.videoId}`,
          date: renderer.publishedTimeText?.simpleText || "",
          snippet: `${renderer.ownerText?.runs?.[0]?.text || ""} · ${renderer.viewCountText?.simpleText || ""}`.replace(/^ · | · $/g, ""),
          scrapeable: false,
        });
        return;
      }
      for (const value of Array.isArray(node) ? node : Object.values(node)) walk(value, depth + 1);
    };
    walk(data);
    return out.filter((item) => item.title);
  },
  async tavily(query) {
    const key = process.env.TAVILY_API_KEY?.trim();
    if (!key) return null;
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, max_results: 6, search_depth: "basic" }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return (data.results || []).map((item) => ({ type: "web", title: item.title, url: item.url, snippet: clip(item.content, 240), scrapeable: true }));
  },
  async brave(query) {
    const key = process.env.BRAVE_API_KEY?.trim();
    if (!key) return null;
    const data = await get(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6&freshness=pm`, { json: true, headers: { "X-Subscription-Token": key, Accept: "application/json" }, timeoutMs: 12_000 });
    return (data.web?.results || []).map((item) => ({ type: "web", title: item.title, url: item.url, date: item.age || "", snippet: clip(stripTags(item.description), 240), scrapeable: true }));
  },
};

function extractPage(html) {
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = decodeEntities(html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1] || "");
  const body = html.replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ");
  const paragraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => stripTags(match[1])).filter((text) => text.length > 60);
  return { title, text: clip([description, ...paragraphs].filter(Boolean).join(" "), 1400) };
}

// Fetches a link taken from the web. Every hop, including redirects, must point at a public host.
async function getPublicPage(rawUrl, { timeoutMs = 8000, maxBytes = 400_000 } = {}) {
  let url = await assertPublicUrl(rawUrl);
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": UA, Accept: "text/html" } });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = await assertPublicUrl(new URL(response.headers.get("location"), url).href);
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!/html|text/i.test(response.headers.get("content-type") || "text/html")) throw new Error("not a page");
    const text = await response.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }
  throw new Error("too many redirects");
}

// Fetches many pages at once (a few at a time) and returns a short readable extract of each.
export async function scrapeMultiple(urls, { concurrency = 4, timeoutMs = 8000 } = {}) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
      while (next < urls.length) {
        const url = urls[next];
        next += 1;
        try {
          const html = await getPublicPage(url, { timeoutMs });
          const page = extractPage(html);
          if (page.text.length > 80) results.push({ url, ...page });
        } catch {
          /* unreachable pages are skipped */
        }
      }
    }),
  );
  return results;
}

const timed = async (name, query, task) => {
  const started = Date.now();
  try {
    const items = await task(query);
    if (items === null) return { name, query, skipped: true, ok: false, count: 0, ms: 0, items: [] };
    return { name, query, ok: true, count: items.length, ms: Date.now() - started, items };
  } catch (error) {
    return { name, query, ok: false, count: 0, ms: Date.now() - started, error: clip(error.message || "failed", 120), items: [] };
  }
};

// Runs every source for every query at the same time, then scrapes the best direct links in parallel.
export async function runResearch({ queries, sources, scrapeLimit = 6 }) {
  const enabled = sources?.length ? sources : Object.keys(SOURCES);
  const jobs = [];
  for (const name of enabled) {
    if (!SOURCES[name]) continue;
    if (name === "trends") jobs.push(timed(name, "", SOURCES.trends));
    else for (const query of queries) jobs.push(timed(name, query, SOURCES[name]));
  }
  const settled = await Promise.all(jobs);

  const seen = new Set();
  const items = [];
  for (const result of settled) {
    for (const item of result.items) {
      const key = `${item.type}:${(item.url || item.title).toLowerCase()}`;
      if (seen.has(key) || !item.title) continue;
      seen.add(key);
      items.push({ ...item, title: clip(item.title, 160), snippet: clip(item.snippet, 240), query: result.query });
    }
  }

  const scrapeUrls = items.filter((item) => item.scrapeable && /^https?:\/\//.test(item.url)).map((item) => item.url).slice(0, scrapeLimit);
  const pages = scrapeUrls.length ? await scrapeMultiple(scrapeUrls) : [];
  const byUrl = new Map(pages.map((page) => [page.url, page]));
  for (const item of items) if (byUrl.has(item.url)) item.extract = byUrl.get(item.url).text;

  const report = Object.values(
    settled.reduce((acc, result) => {
      const row = (acc[result.name] ||= { source: result.name, ok: false, skipped: true, count: 0, errors: [] });
      if (!result.skipped) row.skipped = false;
      if (result.ok) row.ok = true;
      row.count += result.count;
      if (result.error) row.errors.push(result.error);
      return acc;
    }, {}),
  ).map((row) => ({ source: row.source, ok: row.ok, skipped: row.skipped, count: row.count, error: row.ok ? "" : row.errors[0] || "" }));
  report.push({ source: "scrape", ok: pages.length > 0, skipped: scrapeUrls.length === 0, count: pages.length, error: "" });
  return { items, report };
}

export const SOURCE_NAMES = Object.keys(SOURCES);
