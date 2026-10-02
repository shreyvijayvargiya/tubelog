#!/usr/bin/env node
import "./env.js";

const { archiveVideo, generateVideoBlog, syncChannel } = await import("./sync.js");
const { listChannels, listVideos, searchVideos } = await import("./storage.js");
const { fetchChannel, publicChannel } = await import("./youtube.js");
const { formatDuration } = await import("./utils.js");

function flag(args, name) {
  return args.includes(name);
}

function positional(args) {
  return args.filter((arg) => !arg.startsWith("--"));
}

function print(event) {
  const icon = event.level === "warn" ? "⚠" : event.level === "info" ? "↓" : "✓";
  console.log(`${icon} ${event.message}`);
}

function help() {
  console.log(`TubeLog — turn YouTube into your local Markdown learning library.

Usage:
  tubelog start
  tubelog channel <url-or-handle>
  tubelog transcript <video-url-or-id>
  tubelog sync <channel-url> [--ai] [--force] [--limit N]
  tubelog blog <video-url-or-id>
  tubelog videos
  tubelog channels
  tubelog search <query>
  tubelog help

Sync without --ai archives transcripts and does not call OpenRouter.
Sync with --ai also writes an educational blog for videos that do not have one.

Examples:
  tubelog sync https://www.youtube.com/@fireship
  tubelog sync https://www.youtube.com/@fireship --ai
  tubelog transcript https://www.youtube.com/watch?v=abc123def45
  tubelog blog abc123def45
`);
}

async function showChannels() {
  const channels = await listChannels();
  if (!channels.length) {
    console.log("No channels yet. Run: tubelog sync <channel-url>");
    return;
  }
  for (const channel of channels) {
    console.log(
      `${channel.name}  videos:${channel.videoCount}  transcripts:${channel.transcriptCount}  blogs:${channel.blogCount}  ${channel.slug}`,
    );
  }
}

async function showVideos() {
  const videos = await listVideos();
  if (!videos.length) {
    console.log("No videos yet.");
    return;
  }
  for (const video of videos) {
    const transcript = video.transcriptAvailable ? "transcript" : "no-transcript";
    const blog = video.blogGenerated ? "blog" : "no-blog";
    console.log(`${video.videoId}  ${formatDuration(video.duration)}  ${transcript}  ${blog}  ${video.channel}  ${video.title}`);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = positional(rest);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }

  if (command === "start") {
    process.env.NODE_ENV = "production";
    if (!process.env.PORT) process.env.PORT = "3000";
    const { startServer } = await import("../index.js");
    startServer();
    return;
  }

  if (command === "channel") {
    const channel = publicChannel(await fetchChannel(args[0]));
    console.log(`✓ Channel resolved: ${channel.name}`);
    console.log(JSON.stringify(channel, null, 2));
    return;
  }

  if (command === "transcript") {
    const video = await archiveVideo(args[0], { generateBlog: false });
    if (video.transcriptAvailable) console.log(`✓ Transcript saved: ${video.title}`);
    else console.log(`⚠ Transcript unavailable: ${video.title}`);
    console.log(`videos/${video.channelSlug}/${video.videoId}.md`);
    return;
  }

  if (command === "blog") {
    const video = await generateVideoBlog(args[0], {});
    console.log(`✓ Blog generated: ${video.title}`);
    console.log(`videos/${video.channelSlug}/${video.videoId}.md`);
    return;
  }

  if (command === "sync") {
    const limit = rest.find((arg) => arg.startsWith("--limit="));
    const limitFlag = rest.indexOf("--limit");
    const maxVideos = limit ? Number(limit.split("=")[1]) : limitFlag >= 0 ? Number(rest[limitFlag + 1]) : undefined;
    const result = await syncChannel(args[0], {
      generateBlog: flag(rest, "--ai"),
      force: flag(rest, "--force"),
      maxVideos,
      onProgress: print,
    });
    console.log(
      `✓ Done. Saved ${result.saved}. Already archived ${result.alreadyArchived}. Blogs ${result.blogsGenerated}. Failed ${result.failed}.`,
    );
    return;
  }

  if (command === "videos") {
    await showVideos();
    return;
  }

  if (command === "channels") {
    await showChannels();
    return;
  }

  if (command === "search") {
    const query = args.join(" ");
    const { results } = { results: await searchVideos(query) };
    if (!results.length) {
      console.log("No matches.");
      return;
    }
    for (const result of results) {
      console.log(`${result.videoId}  ${result.channel}  ${result.title}`);
      console.log(`  ${result.match.field}: ${result.match.excerpt}`);
    }
    return;
  }

  console.error(`⚠ Unknown command: ${command}`);
  help();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`⚠ ${error.message || error}`);
  process.exitCode = 1;
});
