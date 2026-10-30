import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname } from "node:path";
import { resolveStagedPath } from "./staged-path.js";

const mediaTypes: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".webm": "video/webm",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};

/** Serve one staged program and its lazily decoded frames to local capture pages. */
export async function serveHtmlProgram(
  root: string,
  pages: ReadonlyMap<string, string> = new Map(),
): Promise<{ readonly url: string; close(): Promise<void> }> {
  const base = root;
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      const virtual = pages.get(pathname);
      if (virtual !== undefined) {
        response.writeHead(200, { "Content-Type": mediaTypes[extname(pathname)] ?? "text/html; charset=utf-8" });
        response.end(virtual);
        return;
      }
      const path = resolveStagedPath(base, pathname === "/" ? "index.html" : `.${pathname}`);
      if (path === undefined) {
        response.writeHead(403).end(); return;
      }
      const info = await stat(path);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      const type = mediaTypes[extname(path).toLowerCase()] ?? "application/octet-stream";
      const range = /^bytes=(\d+)-(\d*)$/u.exec(request.headers.range ?? "");
      if (range === null) {
        response.writeHead(200, { "Content-Type": type, "Content-Length": info.size, "Accept-Ranges": "bytes" });
        if (info.size === 0) { response.end(); return; }
        const stream = createReadStream(path);
        response.once("close", () => stream.destroy());
        stream.on("error", () => response.destroy()).pipe(response);
        return;
      }
      const start = Number(range[1]);
      const end = range[2] === "" ? info.size - 1 : Math.min(Number(range[2]), info.size - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= info.size || end < start) {
        response.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end(); return;
      }
      response.writeHead(206, {
        "Content-Type": type,
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${info.size}`,
      });
      const stream = createReadStream(path, { start, end });
      response.once("close", () => stream.destroy());
      stream.on("error", () => response.destroy()).pipe(response);
    } catch (error) {
      response.writeHead((error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500).end();
    }
  });
  await new Promise<void>((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolveReady(); });
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("HTML Program server did not bind a TCP port");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise<void>((resolveClose, reject) => {
      server.close(error => error ? reject(error) : resolveClose());
      server.closeAllConnections();
    }),
  };
}
