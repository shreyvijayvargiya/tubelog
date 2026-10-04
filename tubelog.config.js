export default {
  videosDir: "./videos",
  github: "https://github.com/shreyvijayvargiya/tubelog",
  ai: {
    enabled: false,
    model: "google/gemma-4-31b-it:free",
    models: [
      { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", free: true },
      { id: "qwen/qwen3.8-27b:free", label: "Qwen3.8 27B", free: true },
      { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning", free: true },
      { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B", free: true },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", free: false },
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini", free: false },
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat", free: false },
    ],
  },
  blog: {
    language: "English",
    languages: ["English"],
    style: "educational",
    styles: [
      { id: "educational", label: "Educational" },
      { id: "tutorial", label: "Tutorial" },
      { id: "explainer", label: "Explainer" },
      { id: "technical", label: "Technical Article" },
      { id: "beginner", label: "Beginner Friendly" },
    ],
  },
  instagram: {
    imageModel: "google/gemini-2.5-flash-image",
    imageModels: [
      { id: "google/gemini-2.5-flash-image", label: "Nano Banana" },
      { id: "google/gemini-3.1-flash-lite-image", label: "Nano Banana 2 Lite" },
      { id: "google/gemini-3.1-flash-image", label: "Nano Banana 2" },
    ],
    themes: [
      {
        id: "hook",
        label: "Scroll-stopping hook",
        hook: "Open with a sharp claim from the video, then prove it one idea at a time.",
        look: "High contrast cream and black, one accent color, huge headline type.",
      },
      {
        id: "lesson",
        label: "Teach one idea",
        hook: "Teach a single idea from the video in plain language. The last slide is the takeaway.",
        look: "Editorial paper background, navy type, one simple visual metaphor.",
      },
      {
        id: "steps",
        label: "Step by step",
        hook: "Turn the video into numbered steps someone can save and follow.",
        look: "White cards, a bold step number, black type, lots of space.",
      },
      {
        id: "quotes",
        label: "Quote cards",
        hook: "Pull short lines the video actually says and give each line its own slide.",
        look: "Quiet background, a large quotation, short serif headline.",
      },
      {
        id: "myth",
        label: "Myth and fact",
        hook: "Contrast a common belief with what the video actually says.",
        look: "Split layout, muted side against a bright side, two short lines.",
      },
      {
        id: "list",
        label: "Save-worthy list",
        hook: "Make a list carousel: a hook, the points from the video, then a close.",
        look: "Stacked bold type, one bright accent, generous whitespace.",
      },
    ],
  },
  sync: {
    maxVideos: 20,
    maxPages: 12,
    delayMs: 350,
  },
};
