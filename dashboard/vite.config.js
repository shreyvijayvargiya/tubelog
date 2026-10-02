import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const dashboardRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: dashboardRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.join(dashboardRoot, "src") },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.join(dashboardRoot, "..", "dist"),
    emptyOutDir: true,
  },
});
