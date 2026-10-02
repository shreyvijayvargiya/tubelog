export default {
  videosDir: "./videos",
  github: "https://github.com/yourname/tubelog",
  ai: {
    enabled: false,
    model: "google/gemini-2.5-flash",
    models: [
      "google/gemini-2.5-flash",
      "google/gemini-2.0-flash-001",
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-haiku",
      "deepseek/deepseek-chat",
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
