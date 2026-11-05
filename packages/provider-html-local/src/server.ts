import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const mediaTypes: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".webm": "video/webm",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};

/** Serve one staged program and its lazily decoded frames to local capture pages. */
export async function serveHtmlProgram(root: string): Promise<{ readonly url: string; close(): Promise<void> }> {
  const base = resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      const path = resolve(base, pathname === "/" ? "index.html" : `.${pathname}`);
      if (path !== base && !path.startsWith(`${base}${sep}`)) {
        response.writeHead(403).end(); return;
      }
      const info = await stat(path);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      const type = mediaTypes[extname(path).toLowerCase()] ?? "application/octet-stream";
      const range = /^bytes=(\d+)-(\d*)$/u.exec(request.headers.range ?? "");
      if (range === null) {
        response.writeHead(200, { "Content-Type": type, "Content-Length": info.size, "Accept-Ranges": "bytes" });
        // An empty asset is a complete 200, not an unsatisfiable range.
        if (info.size === 0) { response.end(); return; }
        createReadStream(path).on("error", () => response.destroy()).pipe(response);
        return;
      }
      const start = Number(range[1]);
      // RFC 9110 §14.1.2: a last position at or past the end means "to the end".
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
      createReadStream(path, { start, end }).on("error", () => response.destroy()).pipe(response);
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
    close: () => new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose())),
  };
}
