import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { NodeApplicationHomeAdapter } from "@hypit/application/node";

const browserRoot = fileURLToPath(new URL("./browser/", import.meta.url));

const contentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function browserFile(pathname: string): string {
  const decoded = decodeURIComponent(pathname);
  const selected = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const path = resolve(browserRoot, selected);
  const within = relative(browserRoot, path);
  if (within === "" || within === ".." || within.startsWith(`..${sep}`)) {
    throw new Error("Application Home resource path is outside its browser artifact.");
  }
  return path;
}

export const applicationHomeNodeAdapter: NodeApplicationHomeAdapter = {
  async handle({ request, response, pathname }) {
    if (request.method !== "GET" && request.method !== "HEAD") return false;
    const path = browserFile(pathname);
    const information = await stat(path).catch(() => undefined);
    if (information === undefined || !information.isFile()) return false;
    const body = request.method === "HEAD" ? undefined : await readFile(path);
    const cache = pathname === "/" ? "no-store" : "public, max-age=31536000, immutable";
    response.writeHead(200, {
      "content-type": contentTypes[extname(path)] ?? "application/octet-stream",
      "content-length": information.size,
      "cache-control": cache,
    });
    response.end(body);
    return true;
  },
};
