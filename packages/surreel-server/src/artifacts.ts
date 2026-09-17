import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { constants } from "node:fs";
import { copyFile, mkdir, open, realpath, stat, unlink } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import type { Artifact } from "./types.js";

const mediaTypes: Readonly<Record<string, string>> = {
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".mp3": "audio/mpeg",
  ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg",
};

const execute = promisify(execFile);

async function verifyVideo(path: string): Promise<void> {
  let stdout: string;
  try {
    ({ stdout } = await execute("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type,width,height", "-of", "json", path],
      { encoding: "utf8", timeout: 15_000, maxBuffer: 65_536, windowsHide: true }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Install ffprobe to verify rendered video outputs before publication.");
    throw new Error("The declared video could not be decoded by ffprobe. The render is not ready to publish.");
  }
  const value = JSON.parse(stdout) as { streams?: { codec_type?: string; width?: number; height?: number }[] };
  if (!value.streams?.some((stream) => stream.codec_type === "video" && (stream.width ?? 0) > 0 && (stream.height ?? 0) > 0)) {
    throw new Error("The declared output contains no usable video stream.");
  }
}

export function inside(root: string, file: string): boolean {
  const suffix = relative(root, file);
  return suffix !== "" && suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
}

/** Only a run's declared outputs are published; directory scans never invent results. */
export async function collectArtifacts(root: string, projectId: string, outputDir: string): Promise<Artifact[]> {
  const directory = await realpath(outputDir);
  if (directory !== resolve(outputDir)) throw new Error("The output directory cannot be a symbolic link.");
  const manifestPath = join(directory, "surreel-output.json");
  const manifestFile = await open(manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let value: unknown;
  try {
    const metadata = await manifestFile.stat();
    if (!metadata.isFile() || metadata.size > 65_536) throw new Error("The output manifest must be a JSON file under 64 KB.");
    value = JSON.parse(await manifestFile.readFile("utf8")) as unknown;
  } finally { await manifestFile.close(); }
  if (typeof value !== "object" || value === null || !("artifacts" in value) || !Array.isArray(value.artifacts)
    || value.artifacts.length < 1 || value.artifacts.length > 20) {
    throw new Error("The agent finished without a valid output manifest containing 1–20 artifacts.");
  }
  const targetDir = join(root, "exports", projectId);
  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  const artifacts: Artifact[] = [];
  const copied: string[] = [];
  try {
    for (const item of value.artifacts) {
      if (typeof item !== "object" || item === null || typeof item.path !== "string"
        || item.path.length > 1024 || isAbsolute(item.path) || item.path.includes("\\")
        || item.path.split("/").some((part: string) => part === ".." || part.startsWith("."))) {
        throw new Error("Each output must declare a relative media path inside this run's output directory.");
      }
      const source = resolve(directory, item.path);
      if (!inside(directory, source) || !inside(directory, await realpath(source))) throw new Error("An output escaped its run directory.");
      const file = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
      const extension = extname(source).toLowerCase();
      const mimeType = mediaTypes[extension];
      try {
        const info = await file.stat();
        if (!mimeType || !info.isFile() || info.size < 1 || info.size > 2_147_483_648) {
          throw new Error("An output must be a nonempty supported media file under 2 GB.");
        }
      } finally { await file.close(); }
      if (mimeType.startsWith("video/")) await verifyVideo(source);
      const id = randomUUID();
      const destination = join(targetDir, `${id}${extension}`);
      await copyFile(source, destination, constants.COPYFILE_EXCL);
      copied.push(destination);
      artifacts.push({
        id,
        name: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 180) : basename(source),
        url: `/api/projects/${projectId}/artifacts/${id}`,
        mimeType,
      });
    }
    if (!artifacts.some((artifact) => artifact.mimeType.startsWith("video/"))) {
      throw new Error("The agent produced no rendered video. Check the project activity and render configuration.");
    }
    return artifacts;
  } catch (error) {
    await Promise.all(copied.map((file) => unlink(file).catch(() => undefined)));
    throw error;
  }
}

export async function artifactPath(root: string, projectId: string, artifact: Artifact): Promise<string> {
  const extension = Object.entries(mediaTypes).find(([, value]) => value === artifact.mimeType)?.[0];
  if (!extension) throw new Error("Unsupported artifact media type.");
  // JPEG aliases have a single canonical extension when copying, handled by fallback below.
  const candidates = Object.entries(mediaTypes).filter(([, value]) => value === artifact.mimeType)
    .map(([suffix]) => join(root, "exports", projectId, `${artifact.id}${suffix}`));
  for (const candidate of candidates) {
    try { await stat(candidate); return candidate; } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("This artifact is no longer available on disk.");
}

export async function serveMedia(request: IncomingMessage, response: ServerResponse, path: string, artifact: Artifact): Promise<void> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size === 0) throw new Error("The artifact is not a readable media file.");
    const size = info.size;
    let start = 0;
    let end = size - 1;
    const range = request.headers.range;
    if (range !== undefined) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match && (match[1] || match[2])) {
        if (!match[1]) start = Math.max(0, size - Number(match[2]));
        else start = Number(match[1]);
        if (match[1] && match[2]) end = Math.min(size - 1, Number(match[2]));
      }
      if (!match || (!match[1] && !match[2]) || (match[1] === "" && Number(match[2]) === 0)
        || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
        response.writeHead(416, { "content-range": `bytes */${size}` });
        response.end();
        return;
      }
    }
    response.writeHead(range ? 206 : 200, {
      "content-type": artifact.mimeType,
      "content-length": end - start + 1,
      "accept-ranges": "bytes",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,
      "cache-control": "private, max-age=3600",
      ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
    });
    if (request.method === "HEAD") response.end();
    else await pipeline(file.createReadStream({ start, end, autoClose: false }), response);
  } finally { await file.close(); }
}
