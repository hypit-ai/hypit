import { readdir, readFile, stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

/**
 * A read-only window onto the repository for the browser.
 *
 * A browser cannot list a directory, and the File System Access API cannot
 * follow `src: ./assets/Inter-SemiBold.woff2` out of a stylesheet without a
 * second grant for its parent. Serving the listing from the dev server avoids
 * both, and keeps every path decision on this side where it can be checked.
 */

const SHEET = new Set([".svs"]);
const MEDIA = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif",
  ".mp4", ".webm", ".mov", ".m4a", ".mp3", ".wav",
  ".woff2", ".woff", ".otf", ".ttf",
]);

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".woff2": "font/woff2", ".woff": "font/woff",
  ".otf": "font/otf", ".ttf": "font/ttf",
};

const SKIP = new Set(["node_modules", ".git", ".svml", "dist", ".DS_Store"]);

export type DirectoryEntry = {
  readonly name: string;
  readonly kind: "dir" | "file";
};

export type DirectoryListing = {
  readonly dir: string;
  readonly parent: string | undefined;
  readonly entries: readonly DirectoryEntry[];
};

/**
 * Resolves a request path inside the root, or returns undefined.
 *
 * Containment is checked after resolution, on the resolved path, so `..` and
 * symlinked escapes are both refused rather than merely discouraged.
 */
export function within(root: string, requested: string): string | undefined {
  const target = resolve(root, requested);
  if (target !== root && !target.startsWith(root + sep)) return undefined;
  return target;
}

export async function listDirectory(root: string, dir: string): Promise<DirectoryListing> {
  const target = within(root, dir);
  if (target === undefined) throw new Error("Path is outside the repository.");
  const entries = await readdir(target, { withFileTypes: true });
  const visible = entries
    .filter((entry) => !SKIP.has(entry.name) && !entry.name.startsWith("."))
    .flatMap((entry): DirectoryEntry[] => {
      if (entry.isDirectory()) return [{ name: entry.name, kind: "dir" }];
      const extension = extname(entry.name).toLowerCase();
      if (!SHEET.has(extension) && !MEDIA.has(extension)) return [];
      return [{ name: entry.name, kind: "file" }];
    });
  visible.sort((left, right) =>
      left.kind === right.kind
        ? left.name.localeCompare(right.name)
        : left.kind === "dir" ? -1 : 1);
  const here = relative(root, target);
  return {
    dir: here,
    parent: target === root ? undefined : relative(root, resolve(target, "..")),
    entries: visible,
  };
}

function fail(response: ServerResponse, status: number, message: string): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ error: message }));
}

function json(response: ServerResponse, value: unknown): void {
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(value));
}

export function playgroundBrowsePlugin(root: string): Plugin {
  return {
    name: "svml-playground-browse",
    configureServer(server) {
      server.middlewares.use("/__pg", (request, response, next) => {
        void (async () => {
          const url = new URL(request.url ?? "/", "http://localhost");
          try {
            if (url.pathname === "/list") {
              json(response, await listDirectory(root, url.searchParams.get("dir") ?? "."));
              return;
            }
            const file = url.searchParams.get("file");
            if (file === null) { fail(response, 400, "file is required"); return; }
            const target = within(root, file);
            if (target === undefined) { fail(response, 403, "Path is outside the repository."); return; }
            const info = await stat(target);
            if (!info.isFile()) { fail(response, 404, "Not a file."); return; }

            if (url.pathname === "/read") {
              response.setHeader("content-type", "text/plain; charset=utf-8");
              response.end(await readFile(target, "utf8"));
              return;
            }
            if (url.pathname === "/asset") {
              const extension = extname(target).toLowerCase();
              response.setHeader("content-type", MEDIA_TYPES[extension] ?? "application/octet-stream");
              response.end(await readFile(target));
              return;
            }
            next();
          } catch (error) {
            fail(response, 404, error instanceof Error ? error.message : String(error));
          }
        })();
      });
    },
  };
}
