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
  sync: {
    maxVideos: 20,
    maxPages: 12,
    delayMs: 350,
  },
};
