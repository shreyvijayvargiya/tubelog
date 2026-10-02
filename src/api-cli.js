#!/usr/bin/env node
import { app } from "./api.js";

const argv = process.argv.slice(2);
const command = argv[0];
const rest = argv.slice(1);

function flag(name) {
  return rest.includes(name);
}

function option(name) {
  const inline = rest.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = rest.indexOf(name);
  if (index >= 0 && rest[index + 1] && !rest[index + 1].startsWith("--")) return rest[index + 1];
  return "";
}

function positional() {
  const skip = new Set();
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--limit" || arg === "--style" || arg === "--model" || arg === "--language" || arg === "--channel") {
      skip.add(index);
      if (rest[index + 1] && !rest[index + 1].startsWith("--")) skip.add(index + 1);
    }
  }
  return rest.filter((arg, index) => !arg.startsWith("--") && !skip.has(index));
}

function required(value, label) {
  if (!value) {
    console.error(`⚠ ${label} is required.`);
    console.error("Run: npm run api -- help");
    process.exitCode = 1;
    return "";
  }
  return value;
}

function blogBody() {
  const body = {};
  const model = option("--model");
  const style = option("--style");
  const language = option("--language");
  if (model) body.model = model;
  if (style) body.style = style;
  if (language) body.language = language;
  if (flag("--takeaways")) body.includeTakeaways = true;
  if (flag("--no-takeaways")) body.includeTakeaways = false;
  if (flag("--code")) body.includeCodeExamples = true;
  return body;
}

function help() {
  console.log(`TubeLog API CLI — same routes as the HTTP API, run in-process.

Usage:
  npm run api:health
  npm run api:config
  npm run api:channels
  npm run api:channel -- <slug>
  npm run api:videos -- [slug] [--blog]
  npm run api:video -- <video-id>
  npm run api:transcript -- <video-id>
  npm run api:blog -- <video-id>
  npm run api:markdown -- <video-id>
  npm run api:search -- <query> [--channel slug]
  npm run api:youtube:channel -- <url-or-handle>
  npm run api:youtube:transcript -- <video-url-or-id> [--ai]
  npm run api:sync -- <channel-url> [--ai] [--force] [--limit N]
  npm run api:ai:blog -- <video-url-or-id> [--style name] [--model name]
  npm run api:regenerate -- <video-id> [--style name]
  npm run api:delete -- <video-id>

The dev server does not need to be running.
`);
}

async function call(method, path, body) {
  const response = await app.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const type = response.headers.get("content-type") || "";
  if (type.includes("json")) {
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text);
    }
  } else {
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  }
  if (!response.ok) process.exitCode = 1;
}

const routes = {
  health() {
    return call("GET", "/api/health");
  },
  config() {
    return call("GET", "/api/config");
  },
  channels() {
    return call("GET", "/api/channels");
  },
  channel() {
    const slug = required(positional()[0], "channel slug");
    if (!slug) return undefined;
    return call("GET", `/api/channels/${encodeURIComponent(slug)}`);
  },
  videos() {
    const params = new URLSearchParams();
    const slug = positional()[0];
    const channel = option("--channel") || (slug && slug !== "--blog" ? slug : "");
    if (channel) params.set("channel", channel);
    if (flag("--blog")) params.set("blog", "generated");
    const query = params.toString();
    return call("GET", `/api/videos${query ? `?${query}` : ""}`);
  },
  video() {
    const id = required(positional()[0], "video id");
    if (!id) return undefined;
    return call("GET", `/api/videos/${encodeURIComponent(id)}`);
  },
  transcript() {
    const id = required(positional()[0], "video id");
    if (!id) return undefined;
    return call("GET", `/api/videos/${encodeURIComponent(id)}/transcript`);
  },
  blog() {
    const id = required(positional()[0], "video id");
    if (!id) return undefined;
    return call("GET", `/api/videos/${encodeURIComponent(id)}/blog`);
  },
  markdown() {
    const id = required(positional()[0], "video id");
    if (!id) return undefined;
    return call("GET", `/api/videos/${encodeURIComponent(id)}/markdown`);
  },
  search() {
    const query = required(positional().join(" "), "search query");
    if (!query) return undefined;
    const params = new URLSearchParams({ q: query });
    const channel = option("--channel");
    if (channel) params.set("channel", channel);
    return call("GET", `/api/search?${params.toString()}`);
  },
  "youtube-channel"() {
    const query = required(positional().join(" "), "channel url or handle");
    if (!query) return undefined;
    return call("POST", "/api/youtube/channel", { query });
  },
  "youtube-transcript"() {
    const video = required(positional()[0], "video url or id");
    if (!video) return undefined;
    return call("POST", "/api/youtube/transcript", {
      video,
      generateBlog: flag("--ai"),
      ...(flag("--ai") ? blogBody() : {}),
    });
  },
  sync() {
    const channel = required(positional().join(" "), "channel url");
    if (!channel) return undefined;
    const limit = option("--limit");
    return call("POST", "/api/youtube/sync", {
      channel,
      generateBlog: flag("--ai"),
      force: flag("--force"),
      ...(limit ? { maxVideos: Number(limit) } : {}),
      ...(flag("--ai") ? blogBody() : {}),
    });
  },
  "ai-blog"() {
    const video = required(positional()[0], "video url or id");
    if (!video) return undefined;
    return call("POST", "/api/ai/blog", { video, ...blogBody() });
  },
  regenerate() {
    const id = required(positional()[0], "video id");
    if (!id) return undefined;
    return call("POST", `/api/videos/${encodeURIComponent(id)}/regenerate`, blogBody());
  },
  "delete-video"() {
    const id = required(positional()[0], "video id");
    if (!id) return undefined;
    return call("DELETE", `/api/videos/${encodeURIComponent(id)}`);
  },
};

const run = routes[command];
if (!command || command === "help" || command === "--help" || command === "-h") {
  help();
} else if (!run) {
  console.error(`⚠ Unknown API command: ${command}`);
  help();
  process.exitCode = 1;
} else {
  Promise.resolve(run()).catch((error) => {
    console.error(`⚠ ${error.message || error}`);
    process.exitCode = 1;
  });
}
