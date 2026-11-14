import { createReadStream } from "node:fs";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const editorRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const projectRoot = resolve(editorRoot, "../..");
const mediaRoot = resolve(projectRoot, "media");
const sequencePath = resolve(projectRoot, "broll.sequence.json");
const requestedPort = Number(process.argv[process.argv.indexOf("--port") + 1] ?? 0);
let sequence = JSON.parse(await readFile(sequencePath, "utf8"));

const mimeTypes = {
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".webp": "image/webp",
};

function send(response, status, body, contentType = "application/json; charset=utf-8") {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "access-control-allow-origin": "http://127.0.0.1",
  });
  response.end(body);
}

async function bodyOf(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function finite(value, fallback, minimum, maximum) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function roundLayout(value) {
  return Math.round(value * 1000) / 1000;
}

function mergeLayouts(input) {
  const next = structuredClone(sequence);
  for (const group of next.groups) {
    const incomingGroup = input?.groups?.find((candidate) => candidate.id === group.id);
    if (!incomingGroup || !Array.isArray(incomingGroup.items)) continue;
    for (const item of group.items) {
      const incoming = incomingGroup.items.find((candidate) => candidate.id === item.id);
      if (!incoming?.layout) continue;
      item.layout.x = roundLayout(finite(Number(incoming.layout.x), item.layout.x, -720, 1440));
      item.layout.y = roundLayout(finite(Number(incoming.layout.y), item.layout.y, -1280, 2560));
      item.layout.width = roundLayout(finite(Number(incoming.layout.width), item.layout.width, 24, 1440));
      item.layout.height = roundLayout(finite(Number(incoming.layout.height), item.layout.height, 24, 2560));
    }
  }
  return next;
}

async function serveFile(response, path) {
  const info = await stat(path);
  response.writeHead(200, {
    "content-type": mimeTypes[extname(path).toLowerCase()] ?? "application/octet-stream",
    "content-length": info.size,
    "cache-control": "no-store",
  });
  createReadStream(path).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/") {
      await serveFile(response, resolve(editorRoot, "index.html"));
      return;
    }
    if (url.pathname === "/api/sequence" && request.method === "GET") {
      send(response, 200, JSON.stringify(sequence));
      return;
    }
    if (url.pathname === "/api/sequence" && request.method === "POST") {
      sequence = JSON.parse(await readFile(sequencePath, "utf8"));
      sequence = mergeLayouts(JSON.parse(await bodyOf(request)));
      const temporary = `${sequencePath}.tmp`;
      await writeFile(temporary, `${JSON.stringify(sequence, null, 2)}\n`, "utf8");
      await rename(temporary, sequencePath);
      send(response, 200, JSON.stringify({ ok: true, savedAt: new Date().toISOString(), sequence }));
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/media/")) {
      const path = resolve(projectRoot, `.${decodeURIComponent(url.pathname)}`);
      if (!path.startsWith(`${mediaRoot}/`)) {
        send(response, 403, JSON.stringify({ ok: false, error: "Forbidden" }));
        return;
      }
      await serveFile(response, path);
      return;
    }
    send(response, 404, JSON.stringify({ ok: false, error: "Not found" }));
  } catch (error) {
    send(response, 500, JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
});

server.listen(Number.isFinite(requestedPort) ? requestedPort : 0, "127.0.0.1", () => {
  const address = server.address();
  if (typeof address === "object" && address) {
    console.log(`B-roll layout editor: http://127.0.0.1:${address.port}`);
  }
});
