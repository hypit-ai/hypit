import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const mediaTypes: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".webm": "video/webm",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};

function stagedPath(root: string, pathname: string): string | undefined {
  const path = resolve(root, pathname);
  const boundary = root.endsWith(sep) ? root : `${root}${sep}`;
  return path === root || path.startsWith(boundary) ? path : undefined;
}

/** Serve one request-local staged Programme with byte ranges for browser media. */
export async function serveHtmlProgram(root: string, sourceFrames?: {
  readonly read: (source: string, outputFrame: number) => Promise<{
    readonly stream: ReturnType<typeof createReadStream>;
    readonly size: number;
    readonly release: () => Promise<void>;
  }>;
  readonly close: () => Promise<void>;
}): Promise<{ readonly url: string; close(): Promise<void> }> {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      const preparedSource = /^\/__hypit_source\/([^/]+)\/([0-9]+)\.png$/u.exec(pathname);
      if (preparedSource !== null) {
        if (sourceFrames === undefined) { response.writeHead(404).end(); return; }
        const frame = await sourceFrames.read(preparedSource[1]!, Number(preparedSource[2]));
        response.writeHead(200, { "Content-Type": "image/png", "Content-Length": frame.size, "Cache-Control": "no-store" });
        let complete = false;
        response.once("finish", () => { complete = true; void frame.release(); });
        response.once("close", () => {
          if (!complete) frame.stream.destroy();
          void frame.release();
        });
        frame.stream.on("error", () => response.destroy()).pipe(response);
        return;
      }
      const path = stagedPath(root, pathname === "/" ? "index.html" : `.${pathname}`);
      if (path === undefined) { response.writeHead(403).end(); return; }
      const information = await stat(path);
      if (!information.isFile()) { response.writeHead(404).end(); return; }
      const type = mediaTypes[extname(path).toLowerCase()] ?? "application/octet-stream";
      const range = /^bytes=(\d+)-(\d*)$/u.exec(request.headers.range ?? "");
      if (range === null) {
        response.writeHead(200, { "Content-Type": type, "Content-Length": information.size, "Accept-Ranges": "bytes" });
        if (information.size === 0) { response.end(); return; }
        const stream = createReadStream(path);
        response.once("close", () => stream.destroy());
        stream.on("error", () => response.destroy()).pipe(response);
        return;
      }
      const start = Number(range[1]);
      const end = range[2] === "" ? information.size - 1 : Math.min(Number(range[2]), information.size - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= information.size || end < start) {
        response.writeHead(416, { "Content-Range": `bytes */${information.size}` }).end(); return;
      }
      response.writeHead(206, {
        "Content-Type": type, "Content-Length": end - start + 1, "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${information.size}`,
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
  if (address === null || typeof address === "string") throw new Error("HTML Programme server did not bind a TCP port.");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: async () => {
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => error ? reject(error) : resolveClose());
        server.closeAllConnections();
      });
      await sourceFrames?.close();
    },
  };
}
