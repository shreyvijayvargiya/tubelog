# TubeLog, in one sitting

A short walkthrough you can read, or say out loud while the dashboard is on screen.

**Repo:** [https://github.com/shreyvijayvargiya/tubelog](https://github.com/shreyvijayvargiya/tubelog)

---

## Open on this line

You do not have a learning system. You have a liked playlist and a tab you meant to rewatch.

TubeLog turns that channel into a folder. One video, one Markdown file. The transcript is the note. An AI blog is optional. The file stays on your machine, so an agent can search it later without opening YouTube.

If you are recording, leave the dashboard on the home page for this sentence. The three cards at the top are the whole video.

---

## 1. How to use

**Show:** the first card, then one video row.

TubeLog is a local library. You give it a YouTube channel or a single video. It fetches the captions and writes `videos/<channel>/<video-id>.md`. Open a row and you get the overview, the transcript, and the blog when you have asked for one.

Run the same sync again and it skips files that already exist. New uploads get archived. Shorts are skipped. A video with no captions is marked, and the rest of the channel keeps going.

```bash
git clone https://github.com/shreyvijayvargiya/tubelog.git
cd tubelog
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:3000.

**Pause once.** If you are following along, stop here and open that page. If you are filming, cut to the empty home screen, then to a library that already has a channel.

---

## 2. Add a channel and get the videos

**Show:** Add Content. Paste a channel URL. Land back on the table.

Choose **Add Content**. Paste a channel URL, an `@handle`, or one watch link.

A channel sync saves a batch of new videos, 20 by default. Run it again for the next batch. A single video link saves just that file.

On camera, use a channel people already know. Say the name while the row count goes up. Open one file in the side panel and scroll the transcript for two seconds. That is the product. The player never has to load.

From the terminal, the same action is:

```bash
npm run tubelog -- sync https://www.youtube.com/@fireship
```

---

## 3. Create the AI blog

**Show:** the Generate AI blogs checkbox, then Generate Blog on one row, then the blog tab.

The transcript is the source. The blog is a lesson written from it.

Two ways:

- Check **Generate AI blogs** while you add the channel or the video.
- Or save the transcript first, open the video, and choose **Generate Blog**.

TubeLog calls OpenRouter only when you ask. The key stays in `.env`. It is never copied into the Markdown. The lesson is written into the same file, with the model name and the time it was generated.

Put your key in `.env` before this step, or the click will fail on camera. Then read the first heading of the blog out loud. Stop there. Viewers can open the file themselves.

```bash
npm run tubelog -- sync https://www.youtube.com/@fireship --ai
```

---

## What an agent does with the folder

**Show:** the `videos/` directory, then a search for a word you know is in a transcript.

Point Cursor, Claude, or any local agent at `videos/`. It can quote the transcript, search the library, and draft from the note instead of from the title. The CLI and the HTTP API are the same core the dashboard uses, so an agent can run the sync without clicking.

That is the loop. Archive once. Read the file. Let the next session start from disk.

---

## Close

Clone it. Sync one channel you already trust. Read one Markdown file before you turn AI on.

[https://github.com/shreyvijayvargiya/tubelog](https://github.com/shreyvijayvargiya/tubelog)

**Last line, if you are on camera:** the video is the source, the transcript is the note, and the folder is the library.
