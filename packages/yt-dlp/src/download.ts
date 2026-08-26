/**
 * Fetch a reference video that lives at a link rather than on disk.
 *
 * A reconstruction starts from a video, and most of the videos anybody wants to reconstruct are on
 * TikTok, YouTube, Instagram or Bilibili rather than in a folder. `yt-dlp` is what turns one into a
 * file; everything after that — shot detection, the transcript, the observations, the comparison —
 * reads the file and never learns where it came from.
 *
 * The download is cached by the link. Re-running a route that was interrupted, or preparing the same
 * reference twice, reaches the same bytes at the same path, which is what keeps the reference id
 * stable: it is derived from the file's path, size and modification time, so a second download to a
 * fresh temporary directory would present the same video as a different reference and throw away
 * every observation already paid for.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

/** What a downloaded reference is, once it is a file like any other. */
export type DownloadedReference = {
  readonly path: string;
  readonly url: string;
  /** True when the bytes were already on disk from an earlier run. */
  readonly cached: boolean;
};

/**
 * Whether this is a link to fetch rather than a path to open.
 *
 * Only `http` and `https`. A Windows path opens as a URL with a single-letter scheme (`c:\clip.mp4`
 * parses with protocol `c:`), and a route that read that as a link would hand the whole path to
 * `yt-dlp` and report a network failure for a file sitting on the disk.
 */
export function isReferenceUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Where one link's download lives, keyed by the link so a second run finds the first one's bytes. */
function cacheDirectory(root: string, url: string): string {
  return join(root, createHash("sha256").update(url).digest("hex").slice(0, 16));
}

async function existingDownload(directory: string): Promise<string | undefined> {
  const entries = await readdir(directory).catch(() => []);
  // `yt-dlp` writes `.part` files while it works, so a directory holding only those is an interrupted
  // download rather than a finished one, and it is fetched again.
  const finished = entries.filter((name) => !name.endsWith(".part") && /\.(mp4|mkv|webm|mov)$/iu.test(name));
  return finished.length === 0 ? undefined : join(directory, finished.sort()[0]!);
}

/**
 * Fetch one video and return the file it landed in.
 *
 * The format is asked for as a single muxed file rather than the best video and audio separately,
 * because everything downstream probes one file for both streams. `--no-playlist` keeps a link that
 * happens to sit inside a playlist from fetching the playlist.
 */
export async function downloadReferenceVideo(url: string, root: string): Promise<DownloadedReference> {
  const directory = cacheDirectory(root, url);
  await mkdir(directory, { recursive: true });

  const held = await existingDownload(directory);
  if (held !== undefined) return { path: held, url, cached: true };

  const result = spawnSync("yt-dlp", [
    "--no-playlist",
    "--no-progress",
    "--quiet",
    // One file with both streams. A separate video and audio download would need muxing here, and
    // ffmpeg is already the thing that reads this file next.
    "--format", "best[ext=mp4]/mp4/best",
    "--output", join(directory, "%(id)s.%(ext)s"),
    url,
  ], { encoding: "utf8", windowsHide: true, timeout: 900_000 });

  if (result.error !== undefined && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new Error(
      "yt-dlp is not installed, and a reference given as a link needs it to become a file. "
      + "Install it (`brew install yt-dlp`, `pipx install yt-dlp`) or download the video yourself and "
      + "pass the path instead.");
  }
  if (result.status !== 0) {
    throw new Error(`yt-dlp could not fetch ${url}: ${(result.stderr ?? "").trim().slice(-2000)}`);
  }

  const written = await existingDownload(directory);
  if (written === undefined) throw new Error(`yt-dlp reported success but wrote no video for ${url}`);
  return { path: written, url, cached: false };
}
