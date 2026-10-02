import "./src/env.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { app } from "./src/api.js";
import { rootDir } from "./src/env.js";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

const distDir = path.join(rootDir, "dist");

function insideDist(file) {
  const root = path.resolve(distDir);
  const resolved = path.resolve(file);
  return resolved === root || resolved.startsWith(root + path.sep);
}

export function startServer() {
  const production = process.env.NODE_ENV === "production";
  const port = Number(process.env.PORT || (production ? 3000 : 8787));
  const built = existsSync(path.join(distDir, "index.html"));

  if (production && built) {
    app.use("*", async (c, next) => {
      const url = new URL(c.req.url);
      if (url.pathname.startsWith("/api")) return next();
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (!relative || relative.split("/").includes("..")) {
        const indexFile = path.join(distDir, "index.html");
        const body = await readFile(indexFile);
        return c.body(body, 200, { "Content-Type": TYPES[".html"] });
      }
      const file = path.join(distDir, relative);
      if (!insideDist(file)) return c.text("Bad path", 400);
      if (existsSync(file) && path.extname(file)) {
        const body = await readFile(file);
        const type = TYPES[path.extname(file)] || "application/octet-stream";
        return c.body(body, 200, { "Content-Type": type });
      }
      if (path.extname(relative)) return c.text("Not found", 404);
      const indexFile = path.join(distDir, "index.html");
      const body = await readFile(indexFile);
      return c.body(body, 200, { "Content-Type": TYPES[".html"] });
    });
  }

  app.get("/", (c) =>
    c.json({
      service: "tubelog",
      health: "/api/health",
      dashboard: production ? `http://localhost:${port}` : "http://localhost:3000",
    }),
  );

  serve({ fetch: app.fetch, port }, () => {
    if (production) {
      console.log(`TubeLog running at http://localhost:${port}`);
      if (!built) console.log("Dashboard build not found. Run npm run build. The API is still available.");
    } else {
      console.log(`TubeLog API at http://localhost:${port}`);
      console.log("Dashboard dev server: http://localhost:3000");
    }
  });
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) startServer();
