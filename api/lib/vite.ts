import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(import.meta.dirname, "../dist/public");

  app.use("*", serveStatic({
    root: "./dist/public",
    onFound: (file, c) => {
      // Hashed code files (assets/): their name changes with every version, so the browser keeps them for good.
      if (/[\\/]assets[\\/]/.test(file)) c.header("Cache-Control", "public, max-age=31536000, immutable");
      else if (file.endsWith(".html")) c.header("Cache-Control", "no-cache");
    },
  }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(distPath, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.html(content, 200, { "Cache-Control": "no-cache" });
  });
}
