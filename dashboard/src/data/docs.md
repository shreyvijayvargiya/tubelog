---
title: "Tubelog: Turn Any YouTube Channel Into a Markdown Library and AI Blogs (Free, Open Source)"
description: "Tubelog is a free, open-source local tool that archives a YouTube channel as Markdown files, writes an AI blog from each transcript, makes Instagram posts, translates videos, and finds new video ideas for your channel."
slug: "tubelog-turn-any-youtube-channel-into-a-markdown-library-and-ai-blogs"
publishedAt: "2026-10-04T07:06:00.000Z"
bannerImage: "https://b4fcijccdw.ufs.sh/f/mVUSE925dTRYslGVhGWbPeCnWz7wNuo4HVLUxSBGqrtDyAh0"
tags: "YouTube,Tubelog,Markdown,AI,Open source"
keywords: "YouTube to blog, YouTube transcript to blog post, download all transcripts from a YouTube channel, YouTube transcript to Markdown, turn a YouTube video into a blog post with AI, YouTube content repurposing tool"
author: "Shrey Vijayvargiya"
source: "manual"
---

Every few weeks, someone like Andrej Karpathy or a Y Combinator channel posts an hour of dense, practical material. Most of it never becomes text. It stays locked inside a video that you have to scrub through to find one idea.

That is a content gap, and it is also a content engine. YouTube is the largest pile of expert explanation on the internet, and the raw material is sitting right there as captions. I built **Tubelog**, a free, open-source "YouTube CRM," to turn that pile into a local Markdown library you can search, study, and write from.

This page is the full guide: what Tubelog does, every feature, the tech stack, how to run it, the API, the environment keys, and how to turn a transcript into a blog post that is actually worth publishing.

---

## What is Tubelog?

**Tubelog is a local tool that archives YouTube channels and videos as Markdown files, one file per video, and can optionally generate an AI-written blog from each transcript.** It runs as a CLI, an HTTP API, and a dashboard on your own machine.

The mental model is short: the video is the source, the transcript is the raw knowledge, the blog is the lesson, and the filesystem is the database.

The code is on [GitHub](https://github.com/shreyvijayvargiya/tubelog) under the MIT license.

---

## Features at a glance

- **Archive a channel or a single video.** Give it a channel URL, an `@handle`, a channel ID, or a video link. Each video becomes one Markdown file.
- **Transcripts without the YouTube API.** It reads the public channel page and pulls captions with a few fallback methods. If one method fails, the next is tried.
- **AI blogs on request.** An LLM routed through OpenRouter writes an educational blog from a transcript, only when you ask for it.
- **Instagram posts.** Turn a transcript into a six-slide carousel with a caption, using a theme you choose.
- **Translation and dubbing.** Translate a transcript, speak it in another language, and optionally replace the audio in a local copy of the video with ffmpeg.
- **Ideas for your own channel.** Add your channel, and an agent suggests new videos using your own content plus fresh research on what is trending.
- **Video Studio.** Describe a clip, optionally let an AI model improve the prompt, and generate it with an OpenRouter video model. Clips are saved on your machine.
- **Discover.** Start from 100 built-in channels across Tech, Programming, Coding, AI, SaaS, and News.
- **A local dashboard.** Browse channels, videos, transcripts, blogs, and ideas. Search the whole library.
- **A CLI and an HTTP API.** The same core powers all three, so they never drift apart.
- **No database.** Markdown and JSON files on disk are the storage layer. Sync is safe to run twice.

---

## Quick start: run Tubelog in two minutes

You need Node.js 20 or newer. Translation and dubbing also need [ffmpeg](https://ffmpeg.org/download.html) on your PATH. Everything else works without it.

1. **Clone the repo:** `git clone https://github.com/shreyvijayvargiya/tubelog`
2. **Install and configure:**

```bash
npm install
cp .env.example .env
npm run dev
```

3. **Open the dashboard** at `http://localhost:3000`. In development the dashboard is a Vite server on port 3000 that proxies `/api` to the Hono server on port 8787.

To archive a whole channel from the command line without spending any AI credits:

```bash
npm run tubelog -- sync https://www.youtube.com/@fireship
```

To archive it and write blogs for the new transcripts:

```bash
npm run tubelog -- sync https://www.youtube.com/@fireship --ai
```

For a single video:

```bash
npm run tubelog -- transcript https://www.youtube.com/watch?v=VIDEO_ID
npm run tubelog -- blog VIDEO_ID
```

For production, run `npm run build && npm start` and open `http://localhost:3000`.

---

## Using the dashboard

| Page | What it does |
| --- | --- |
| **Dashboard** | Three onboarding cards, library counts, a demo video, and the latest videos. **Add Content** takes a channel URL, an `@handle`, or a video link. |
| **Discover** | Search and filter 100 built-in channels. **Start scraping** archives the next 20 videos. Run it again to continue. |
| **Channels** | Channels saved on your machine. A channel page has search, **Sync Channel**, and **Generate Missing Blogs**. |
| **Videos** | Every archived video across channels. Click a row to open the side panel. |
| **Blogs** | Lessons written from transcripts. Read, regenerate, or jump back to the video. |
| **Ideas** | New video ideas for your own channel. See [Ideas for your channel](#ideas-for-your-channel). |
| **Studio** | Generate short videos from a prompt. See [Video Studio](#video-studio). |
| **Changelog** | Release notes with a video for each update. |
| **Docs** | This page. |
| **Settings** | Public configuration only. Your API key is never shown. |

The **video side panel** plays the YouTube video and has tabs for the overview, the transcript, the AI blog, Instagram posts, and translation.

---

## How Tubelog works

**Tubelog has one core and three front doors.** The logic for talking to YouTube, fetching transcripts, saving files, syncing, and calling the LLM lives in a handful of modules under `src/`. The CLI, the Hono API, and the React dashboard all call those same modules.

```
YouTube channel or video
        ↓
metadata + transcript
        ↓
videos/<channel>/<video-id>.md
        ↓
optional OpenRouter blog, Instagram posts, translation
        ↓
dashboard, CLI, and API
```

### Tech stack

| Part | Technology |
| --- | --- |
| Frontend | Vite, React, Tailwind CSS, Radix UI components in the shadcn/ui style |
| Backend | [Hono](https://hono.dev/) on Node.js, a lightweight framework built on Web Standards |
| AI | [OpenRouter](https://openrouter.ai/learn), one API for hundreds of models, so switching a model is a one-line change |
| Storage | Markdown and JSON files on your disk |
| Media | ffmpeg for audio and video (translation and dubbing only) |

---

## "No APIs, no auth, no databases": what that actually means

**Tubelog needs no YouTube API key, no user accounts, and no database.** That is the "free" part, and it is worth being precise about, because some features still need a key.

- **No YouTube Data API.** Tubelog reads the public channel page and pulls captions the way a browser would, with a few fallback methods.
- **No auth.** It is a local tool. There are no logins or sessions.
- **No database.** Files on disk are the storage layer. Sync is idempotent because the video ID is the filename, so running it twice never creates duplicates.
- **One optional key.** AI features need an `OPENROUTER_API_KEY` in your `.env`. Archiving transcripts works without it, and the server never calls OpenRouter unless you ask for an AI feature.

A filesystem as the database is a good default for a solo project. It costs nothing to run, it diffs cleanly in git, and any tool that reads text can use it.

---

## What a Tubelog Markdown file looks like

Each video becomes one file with frontmatter and the transcript:

```markdown
---
video_id: "No-JPdFvYWU"
channel: "Fireship"
title: "How AI Agents Work"
url: "https://www.youtube.com/watch?v=No-JPdFvYWU"
published_at: "2026-10-01"
transcript_available: true
blog_generated: false
---

# Transcript

Full transcript here.
```

When you generate a blog, it is appended to the same file under an "AI Generated Blog" heading, followed by a small metadata block recording the model and timestamp. One video, one file, and the original watch URL stays in the frontmatter so you can always link back to the source.

Here is the full folder layout:

```text
videos/
  fireship/
    channel.json
    No-JPdFvYWU.md
    ig/No-JPdFvYWU/            Instagram carousel (carousel.json, 1.png ...)
    translations/No-JPdFvYWU/  spanish.mp3, spanish.md, spanish.mp4, spanish.json
    memory.json                your channel memory (your own channels only)
    ideas/                     ideas.json, page-0001.json ... (your own channels only)
generated/
  vid-xxxxxxxx/                video.mp4 and meta.json from the Studio
```

Plain files mean the library works with everything: your editor, `grep`, a static site generator, or an LLM that you point at the folder.

---

## AI blog generation with OpenRouter

**Tubelog generates blogs through OpenRouter so you can swap models without touching code.** The default is the free model set in `tubelog.config.js` (`google/gemma-4-31b-it:free`). Several other free and paid models are listed in the same file, and you can override the default with the `OPENROUTER_MODEL` environment variable. OpenRouter is OpenAI-SDK compatible, so pointing at a different model is a string change.

Tubelog supports a few writing styles: educational, tutorial, explainer, technical, and beginner. You can also toggle takeaways, an embedded link to the original video, and code examples. The system prompt lives in a plain file, `prompts/blog-writer.md`, which tells the model to teach the ideas, stay inside the source, and keep only code that the transcript actually contains. Edit that file and you change the voice of every blog.

Free models are rate limited and vary in quality. They do not spend OpenRouter credits.

---

## Instagram posts

Open a saved video, choose **IG Posts**, then **Create IG posts**. Pick one of six themes:

| Theme | What it does |
| --- | --- |
| Scroll-stopping hook | A sharp claim, then the proof |
| Teach one idea | One lesson, and a takeaway on the last slide |
| Step by step | Numbered steps from the video |
| Quote cards | Short lines the video actually says |
| Myth and fact | A common belief against what the video says |
| Save-worthy list | A list of points, then a close |

A free text model writes six slides and a caption from the transcript. An OpenRouter image model draws a portrait image for each slide, which uses credits. The result is saved next to the transcript in `videos/<channel>/ig/<video-id>/`.

---

## Translation and dubbing

Open a saved video and choose **Translation**. Pick a language and a voice, then **Create translation**.

1. An OpenRouter text model translates the transcript.
2. An OpenRouter audio model speaks the translation, saved as an MP3.
3. If a local video file exists, ffmpeg removes its original audio and adds the new audio. The dubbed video is a separate MP4. The original file is never changed.

Tubelog does not download videos from YouTube. To get a dubbed video, put `<video-id>.mp4` in the channel folder, or pass a direct `videoUrl` to the API. Only the first 15,000 characters of a transcript are translated by default, and speech uses OpenRouter credits.

---

## Ideas for your channel

Add your own channel and Tubelog suggests what to make next.

1. Open the channel menu at the top of the sidebar and choose **Add my channel**. Paste your URL, or pick a saved channel, and describe your channel. Tubelog imports your latest videos and transcripts and builds a memory of what you cover. You can add more than one channel and switch between them.
2. Open **Ideas** and choose **Find new ideas**. An optional focus, such as "voice agents", steers the run.
3. Click an idea to open the side panel with tabs for **Overview**, **Script**, **Assets**, **Music**, and **Sources**. **Generate script & assets** writes a script, thumbnail concepts, a shot list, and a music brief on demand.

Every run gives the model two things:

- **Your channel memory.** A short digest of each of your videos, always built from the transcript, plus a summary of your niche, audience, and themes. Raw transcripts are not sent on every run.
- **Fresh research.** Google News, Hacker News, Google Trends, and a YouTube search, all fetched at the same time, then the best direct links scraped in parallel. If you set a `TAVILY_API_KEY` or `BRAVE_API_KEY`, web search is added. A source that fails never fails the run.

The model also sees the titles of ideas it already gave you, and near-duplicates are dropped, so each run is new. The agent only researches and suggests. It never writes a script until you ask.

Ideas are stored in `videos/<channel>/ideas/ideas.json`, which keeps the newest five runs. Older runs move into numbered page files that the table pages through. Saved and scripted ideas stay pinned on the first page. `memory.json` and `ideas/` are git-ignored, so your own channel data never lands in a commit.

It is built to cost close to nothing: free OpenRouter models, free research sources, and short digests instead of full transcripts. Tubelog does not read YouTube Analytics. The YouTube search and Google Trends sources use public pages and can break. If a source is down, the run still works from your own videos.

---

## Video Studio

Open **Studio** to generate a short video from a prompt. Tubelog uses OpenRouter's video generation, so it needs only the `OPENROUTER_API_KEY` you already have.

1. Write a detailed prompt: the subject, the setting, how the camera moves, the light and mood, and what happens from start to end. Clips are short, so describe one scene.
2. Choose a model, a duration, a resolution, and an aspect ratio. The choices come from what each model says it supports, and the price is shown before you confirm.
3. Optionally tick **Improve my prompt with an AI model first**. A text model, which can be Opus or any Claude model, rewrites your idea as a detailed video prompt. You can read the improved prompt on the finished video.
4. Choose **Generate video**. Video models take a few minutes, so the page shows the job's progress. When it is ready, the video appears in your gallery with its prompt, and you can play, download, reuse the prompt, or delete it.

Generating a video is asynchronous on OpenRouter: Tubelog submits a job, checks it until it finishes, then downloads the file. Videos are saved in `generated/<id>/video.mp4` with a `meta.json` that records the prompt, model, and settings. The `generated/` folder is git-ignored.

Video generation is not free. It is billed per second by the model's provider through your OpenRouter account. Clips are capped at 12 seconds by default (`studio.maxSeconds`) so a typo cannot create a large bill. The text models that write the video prompt are not the ones that make the video: Opus and other language models write the prompt, and a video model such as Veo makes the clip. If a clip contains realistic synthetic footage, check YouTube's current rules on disclosing altered or synthetic content before you publish it.

---

## API reference

All routes are under `/api`. Responses are JSON. Errors look like `{ "error": "message" }`.

### Library (no AI)

| Method | Route | What it does |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/config` | Public configuration. Never includes keys |
| `GET` | `/api/channels` | Saved channels with counts |
| `GET` | `/api/channels/:channel` | One channel and its videos |
| `GET` | `/api/videos` | All videos. `?channel=slug` and `?blog=generated` filter |
| `GET` | `/api/videos/:id` | One video with transcript, blog, Instagram, and translations |
| `GET` | `/api/videos/:id/transcript` | The transcript |
| `GET` | `/api/videos/:id/blog` | The AI blog |
| `GET` | `/api/videos/:id/markdown` | The raw Markdown file |
| `GET` | `/api/search?q=` | Search titles, blogs, and transcripts |
| `POST` | `/api/youtube/channel` | Resolve a channel and save it. Does not archive videos |
| `POST` | `/api/youtube/transcript` | Fetch and save one transcript |
| `POST` | `/api/youtube/sync` | Archive new videos from a channel |
| `DELETE` | `/api/videos/:id` | Delete a video and its extra files |

Fetch a transcript and archive a channel, without any AI:

```bash
curl -X POST http://localhost:3000/api/youtube/transcript \
  -H "Content-Type: application/json" \
  -d '{"video":"No-JPdFvYWU"}'

curl -X POST http://localhost:3000/api/youtube/sync \
  -H "Content-Type: application/json" \
  -d '{"channel":"https://www.youtube.com/@fireship","maxVideos":20}'
```

### AI

| Method | Route | What it does |
| --- | --- | --- |
| `POST` | `/api/ai/blog` | Write a blog from a saved transcript |
| `POST` | `/api/videos/:id/regenerate` | Write the blog again |
| `POST` | `/api/ai/instagram` | Create an Instagram carousel |
| `GET` | `/api/videos/:id/instagram` | The saved carousel |
| `POST` | `/api/ai/translate` | Translate, speak, and optionally dub a video |
| `GET` | `/api/videos/:id/translations` | List saved translations |
| `GET` | `/api/videos/:id/translations/:lang/audio` | Stream a translation's audio. Also `video` and `text` |

```bash
curl -X POST http://localhost:3000/api/ai/blog \
  -H "Content-Type: application/json" \
  -d '{"video":"No-JPdFvYWU","style":"tutorial"}'

curl -X POST http://localhost:3000/api/ai/translate \
  -H "Content-Type: application/json" \
  -d '{"video":"No-JPdFvYWU","language":"Spanish"}'
```

Blog options are `model`, `style` (`educational`, `tutorial`, `explainer`, `technical`, `beginner`), `language`, `includeTakeaways`, `includeOriginalVideo`, and `includeCodeExamples`. Translation takes `language`, `voice`, `replaceAudio`, and an optional `videoUrl`.

### Studio (video generation)

| Method | Route | What it does |
| --- | --- | --- |
| `GET` | `/api/studio/models` | Video models with their supported durations, resolutions, aspect ratios, and pricing |
| `POST` | `/api/ai/video` | Generate a video. It waits until the clip is saved |
| `GET` | `/api/studio/videos` | List generated videos, newest first |
| `GET` | `/api/studio/videos/:id` | One video's details |
| `GET` | `/api/studio/videos/:id/file` | Stream the MP4, with range support |
| `DELETE` | `/api/studio/videos/:id` | Delete a video and its file |

```bash
curl -X POST http://localhost:3000/api/ai/video \
  -H "Content-Type: application/json" \
  -d '{"prompt":"A slow dolly shot through a rainy neon street at night, a lone cyclist crosses the frame, cinematic 35mm look.","model":"google/veo-3.1","duration":6,"resolution":"720p","aspectRatio":"16:9","refine":true}'
```

`prompt` is required (10 to 4000 characters). `refine: true` rewrites the prompt first, using `refineModel` or the default text model. `duration` cannot exceed `studio.maxSeconds`. The request can take several minutes.

### Your channels and ideas

| Method | Route | What it does |
| --- | --- | --- |
| `GET` | `/api/my-channels` | Your channels, with memory and idea counts |
| `POST` | `/api/my-channels` | Add a channel (`url` or `channel`), with a `description` |
| `POST` | `/api/my-channels/:slug/memory` | Rebuild the memory. `{"sync": true}` imports new videos first |
| `DELETE` | `/api/my-channels/:slug` | Stop treating a channel as yours. The library is kept |
| `POST` | `/api/ai/ideas` | Find new video ideas. `channel` is required |
| `GET` | `/api/channels/:slug/ideas?page=1` | List ideas, newest first, one page at a time |
| `GET` | `/api/channels/:slug/ideas/:ideaId` | One idea |
| `PATCH` | `/api/channels/:slug/ideas/:ideaId` | Set `status` to `new`, `saved`, `dismissed`, or `scripted` |
| `POST` | `/api/channels/:slug/ideas/:ideaId/produce` | Write the script, assets, and music brief |

```bash
curl -X POST http://localhost:3000/api/my-channels \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/@yourchannel","description":"I teach indie developers to build SaaS."}'

curl -X POST http://localhost:3000/api/ai/ideas \
  -H "Content-Type: application/json" \
  -d '{"channel":"yourchannel","focus":"voice agents","count":8}'

curl -X POST http://localhost:3000/api/channels/yourchannel/ideas/IDEA_ID/produce \
  -H "Content-Type: application/json" \
  -d '{"script":true,"assets":true,"music":true,"images":false}'
```

`count` is 3 to 12. `images: true` also draws two thumbnails, which uses OpenRouter credits. The music output is a brief with mood, tempo, and search terms. Tubelog does not generate audio tracks.

---

## CLI

```bash
node src/cli.js <command>
# or
npm run tubelog -- <command>
```

| Command | What it does |
| --- | --- |
| `tubelog start` | Serve the API and the built dashboard on port 3000 |
| `tubelog channel <url-or-handle>` | Resolve a channel and print its metadata |
| `tubelog transcript <video-url-or-id>` | Fetch a transcript and save one Markdown file |
| `tubelog sync <channel>` | Archive new videos. Does not call OpenRouter |
| `tubelog sync <channel> --ai` | Archive new videos and write missing blogs |
| `tubelog sync <channel> --force` | Refresh transcripts for the newest batch |
| `tubelog sync <channel> --limit 5` | Cap how many new videos this run archives |
| `tubelog blog <video-url-or-id>` | Generate a blog for one video |
| `tubelog videos` / `tubelog channels` | List local videos or channels |
| `tubelog search <query>` | Search the local Markdown |

The same API routes are available as commands that run in-process, for example `npm run api:ai:instagram`, `npm run api:ai:translate`, and `npm run api:ai:ideas -- yourchannel --focus "voice agents"`.

---

## Environment keys and configuration

Copy `.env.example` to `.env`. Keys stay in `.env` and are never written into Markdown or JSON files.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | For AI features | Blogs, Instagram posts, translation, and ideas. Get one at [openrouter.ai/keys](https://openrouter.ai/keys) |
| `OPENROUTER_MODEL` | No | Overrides the default text model in `tubelog.config.js` |
| `OPENROUTER_TTS_MODEL` | No | The speech model for translation audio. It must support audio output |
| `TAVILY_API_KEY` | No | Adds web search to the ideas agent |
| `BRAVE_API_KEY` | No | Adds Brave web search to the ideas agent |
| `PORT` | No | API port. `8787` in development, `3000` in production |
| `TUBELOG_VIDEOS_DIR` | No | Where the library lives. Default `./videos` |
| `TUBELOG_GENERATED_DIR` | No | Where Studio videos are saved. Default `./generated` |
| `TUBELOG_GITHUB_URL` | No | The GitHub link in the dashboard |
| `OPENROUTER_BASE_URL` | No | Advanced. Points the AI features at another OpenRouter-compatible endpoint |

`tubelog.config.js` holds the rest: the model list, blog styles and languages, Instagram themes and image models, translation voices and languages, ideas settings, and sync limits.

```js
sync: { maxVideos: 20, maxPages: 12, delayMs: 350 },
ideas: { count: 8, runsPerPage: 5, memoryVideos: 30, queries: 3, geo: "US" },
studio: { maxSeconds: 12, timeoutMinutes: 15, pollSeconds: 5, models: ["google/veo-3.1", "google/veo-3.1-lite"] },
```

---

## From transcript to a blog worth publishing

**A transcript is raw material, not a draft.** Several sources on YouTube repurposing make the same point: publishing a transcript with light edits is the most common mistake, and the better approach is to find the three to five main ideas, make those your headings, and [write each section properly](https://techbullion.com/repurpose-youtube-videos/) using the transcript for substance rather than phrasing.

Spoken language is also messy on the page. [Pasting captions straight into a post](https://zemith.com/blogs/youtube-to-blog) gives you broken phrases, repeated clauses, and fragments. One guide on [turning transcripts into posts](https://www.camb.ai/blog-post/transcribe-youtube-video-to-text-and-repurpose-content) estimates that a roughly 3,000-word transcript condenses into a 1,000 to 1,500-word post that reads better.

Here is a workflow that treats the AI output as a first draft:

1. **Pick videos worth the effort.** Not every video deserves a post. Prefer tutorials, teardowns, and talks with a clear takeaway.
2. **Generate the first draft with Tubelog.** Use the `tutorial` or `technical` style for developer content.
3. **Rewrite the structure.** Cut intro chatter and filler. Reorder sections so each one makes a claim in its first sentence.
4. **Add what the video could not carry.** Code you tested yourself, a comparison table, a diagram, a mistake you hit, a link to the docs.
5. **Credit and link the source.** Name the creator, link the video, and embed it. Your post should send people to the original, not replace it.
6. **Fact-check anything specific.** Names, numbers, versions, and commands. LLMs and auto-captions both get these wrong.

### The scale trap

Because Tubelog can archive a whole channel in one command, it is tempting to generate a hundred posts and publish them all. Don't. Google's [scaled content abuse policy](https://developers.google.com/search/blog/2024/03/core-update-spam-policies) targets many pages created mainly to manipulate rankings rather than help readers, and it applies whether the pages come from AI, humans, or a mix.

The way to stay on the right side of that is editorial: fewer posts, each with real added value and a human review step. Automation handles the research and the draft, and a person handles the judgment.

---

## Limits and gotchas

Being honest about what Tubelog does not do:

- **Missing captions.** If a video has no captions Tubelog can read, the file is still saved with `transcript_available: false` and the sync keeps going. Run `sync --force` to retry later.
- **Rate limiting.** YouTube sometimes blocks automated requests with a 429 or a consent wall. Tubelog treats this as retryable rather than permanently missing, and it adds a short delay between requests. Cloud and data-center IP addresses are blocked more often, so running locally works best.
- **20 videos per sync by default.** That is the `sync.maxVideos` setting. Run sync again to continue through the channel, since already archived videos are skipped.
- **Shorts are skipped.**
- **Video generation costs money.** Studio clips are billed by OpenRouter per second and are short, a few seconds each. Tubelog shows the price before you confirm and caps the clip length.
- **Free models vary.** Free OpenRouter models are rate limited and the quality changes. Tubelog falls back to the next free model when one is busy.
- **It is a local tool.** There are no accounts, billing, cloud storage, or scheduled sync in this version. Serverless hosts such as Vercel have no persistent disk, so a hosted version needs a storage layer. MCP and Claude integration, cloud storage, and scheduled sync are on the roadmap.
- **Respect creators and platforms.** A transcript is someone else's work. Use it to learn, to summarize, and to write a new piece with your own analysis, and always credit and link the source. Follow YouTube's Terms of Service. This is general guidance, not legal advice, so check the creator's terms if you plan to republish at scale.

---

## What to build on top

Tubelog is deliberately small, so it is a good base for your own ideas:

- **A searchable personal wiki.** Sync the 10 channels you learn from and use `tubelog search`, or point an LLM at the `videos/` folder.
- **A content-ideas pipeline.** Add your own channel, run the ideas agent each week, and queue the best ones.
- **A creator tool.** If you make videos, archive your own channel and turn each upload into a companion blog post with the video embedded.
- **An agent knowledge source.** The Markdown library is a ready-made context folder for any agent that uses files as memory.
- **A hosted SaaS.** The dashboard is just a client of the API, so you can host the Hono server and add accounts.

---

## Free checklist: YouTube to blog in 10 steps

Copy this into your notes:

1. Choose one channel you trust and one playlist or video with a clear takeaway.
2. Run `tubelog sync <channel>` without `--ai` first, and read the transcript.
3. Write the one-sentence claim the post will make.
4. Pull 3 to 5 headings from the main ideas, not from the video's chronology.
5. Generate a draft with `tubelog blog <video-id>` in `tutorial` or `technical` style.
6. Delete filler. Make each section open with a clear statement.
7. Add something the video lacked: tested code, a table, a diagram, or a correction.
8. Verify every name, number, version, and command.
9. Credit the creator, link the video, and embed it.
10. Add 2 to 3 internal links, publish, and move on to the next video.

---

## FAQ

**Is Tubelog free?** Yes. It is open source under the MIT license and runs locally. Archiving transcripts costs nothing. AI features use free OpenRouter models by default. Only the optional paid models, image generation, and speech use credits on your OpenRouter account.

**Do I need a YouTube API key?** No. Tubelog does not use the YouTube Data API. It needs an OpenRouter key only for AI features.

**Can Tubelog download all transcripts from a YouTube channel?** Yes, in batches. It archives up to 20 new videos per run by default, skips ones it already has, and lets you run sync again to continue. Videos without readable captions are saved without a transcript, and Shorts are skipped.

**Where are the files stored?** On your machine, in `videos/<channel>/<video-id>.md`.

**Which AI model does it use?** The default is the free model set in `tubelog.config.js`. You can change it with `OPENROUTER_MODEL`, per request with the `model` option, or in the dashboard.

**Can I generate videos with Tubelog?** Yes, short clips in the Studio, through OpenRouter's video models. It is paid per second, and a language model such as Opus only helps write the prompt.

**Does the ideas agent need my analytics?** No. It reads your own transcripts and public research. It does not use YouTube Analytics.

**Is it okay to publish an AI blog made from someone else's video?** Treat the output as a draft. Add your own analysis, credit and link the creator, embed the original video, and avoid mass-publishing near-copies. Google's spam policies target scaled, low-value content regardless of how it was made.

---

## Conclusion

YouTube already contains the best explanations in software, AI, and startups. The bottleneck is turning that spoken knowledge into something you can search, link, and learn from. Tubelog automates the boring part, fetching and storing transcripts as Markdown, and gives you an AI first draft, Instagram posts, translations, and fresh video ideas when you want them. The judgment, structure, and original insight are still yours to add.

**Try it:** [clone Tubelog on GitHub](https://github.com/shreyvijayvargiya/tubelog), archive one channel you follow, and publish one good post from it this week.
