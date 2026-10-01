// Serves the `expo export -p web` output for Playwright, with single-page-app fallback.
// Usage: node e2e/static-server.mjs <dir> <port>
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.argv[2] ?? "dist";
const port = Number(process.argv[3] ?? 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  // Keep requests inside the export folder.
  const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\]|\.\.[/\\])+/, "");
  const requested = join(root, relative);
  const file = (await isFile(requested)) ? requested : join(root, "index.html");

  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} on http://127.0.0.1:${port}`);
});
