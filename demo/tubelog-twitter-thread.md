# TubeLog: Twitter/X Launch Thread (copy-paste ready)

Post each block as one tweet, in order. Attach the suggested image where noted (files are in `dashboard/public/screenshots/`). Put the link only in the last tweet.

---

## Tweet 1 (attach: dashboard.png or the explainer video)

Every great YouTube channel is a blog nobody wrote.

So I built TubeLog: scrape any public channel, pull every transcript, and have an AI agent turn them into SEO blogs and IG posts.

Open source. Runs on your machine. 🧵

---

## Tweet 2

Hours of expert knowledge sit inside videos you'll never rewatch.

You can't search them, repurpose them or own them.

TubeLog turns each video into a Markdown file you can actually use.

---

## Tweet 3 (attach: discover.png)

1/ Scrape any public channel

Paste a channel, an @handle or a single video. Discover also ships with 100 built-in channels across Tech, AI, SaaS, Programming and News.

One click on "Start scraping" archives the next 20 transcripts. Run it again to continue.

---

## Tweet 4 (attach: blogs.png)

2/ An AI agent writes SEO blogs from the transcript

Each blog comes out structured: what you'll learn, intro, sections and takeaways.

It only runs when you ask (--ai), so you never spend credits by accident. Uses OpenRouter with your own key.

---

## Tweet 5 (attach: screenshot of terminal / API JSON)

3/ APIs that need no AI

Fetch channels, videos and transcripts over HTTP or the CLI:

GET /api/videos
GET /api/videos/:id/transcript
POST /api/youtube/sync

Good for pipelines, agents, newsletters and research.

---

## Tweet 6 (attach: screenshot of the videos/ folder)

4/ Your library lives on your disk

One Markdown file per video:
videos/<channel>/<video-id>.md

No hosted database. API keys stay in .env and never get written into the files. Sync twice and you get no duplicates.

---

## Tweet 7 (attach: video.png)

5/ YouTube → Instagram

Open any video, click "Create IG posts", pick a theme, and TubeLog turns the transcript into a carousel with the slide images rendered.

---

## Tweet 8 (attach: dashboard.png)

6/ A dashboard that works like a CRM for your YouTube library

Channels, videos, transcripts and blogs in one place, with search, filters and a side panel that plays the video next to the transcript and the blog.

Stack: Vite + React + Hono + Node.

---

## Tweet 9 (link goes here)

Free, open source and MIT licensed:

git clone https://github.com/shreyvijayvargiya/tubelog
npm install && npm run dev

⭐ the repo if it's useful:
github.com/shreyvijayvargiya/tubelog

Want a feature? Reply and I'll build it next.

---

# Single-tweet alternatives (pick one to A/B test)

**A (benefit-led)**

I turned YouTube into a Markdown knowledge base.

Scrape a channel → transcripts → AI SEO blogs → IG carousels. All local, all open source.

github.com/shreyvijayvargiya/tubelog

**B (builder-led)**

Built a "YouTube → Blog CRM" this week.

Paste a channel, get every transcript as Markdown, then one click to an SEO blog or IG post. Your files, your machine, MIT licensed.

github.com/shreyvijayvargiya/tubelog

**C (contrarian)**

Stop bookmarking YouTube videos you'll never watch.

Turn the whole channel into searchable Markdown instead. TubeLog does it locally and it's free.

github.com/shreyvijayvargiya/tubelog

**D (for devs and agents)**

TubeLog gives your agents a clean YouTube data layer: channels, videos and transcripts via CLI + REST, stored as plain Markdown. No AI required unless you want blogs.

github.com/shreyvijayvargiya/tubelog

---

# Follow-up tweets (post over the next few days)

1. What's one YouTube channel you'd want as a searchable blog? Reply with it and I'll run TubeLog on it and share the result.

2. Before → after: a raw transcript next to the finished blog (attach two screenshots).

3. Shipped today: IG carousels generated straight from a video transcript. (attach video.png)

4. Poll: Biggest pain with YouTube research? Search / Rewatching / Repurposing / Note-taking

5. Honest limits: Shorts are skipped, each sync archives 20 videos by default, and videos without captions are skipped. Public channels only. Respect creators' rights when you republish.

---

# Posting checklist

- Pin the thread and add the GitHub link to your bio.
- Use at most 1-2 hashtags: #buildinpublic #opensource
- Post Tue-Thu in US morning hours. Reply to every comment in the first hour.
- Only tag OpenRouter or showcased channels if you're comfortable with it. Don't imply a partnership.
