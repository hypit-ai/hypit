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
 *
 * The tool is a pinned Python dependency under `services/yt-dlp`, reached through `uv`, and not a
 * binary the machine happens to carry. `yt-dlp` releases constantly because it is chasing sites that
 * keep changing, so an unpinned copy makes the same link fetch differently on two machines — which
 * would make a reconstruction unreproducible for a reason that has nothing to do with the video. This
 * is the same shape WhisperX and OpenCV already use for their Python programs.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

/**
 * The uv project holding the pinned `yt-dlp`.
 *
 * Found by walking up from this module rather than from the working directory, which is wherever the
 * author happened to run the command from and is routinely outside the tree.
 */
function serviceProject(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = join(directory, "services", "yt-dlp", "pyproject.toml");
    if (existsSync(candidate)) return dirname(candidate);
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error("no services/yt-dlp project above this module; the Distribution is incomplete");
    }
    directory = parent;
  }
}

/** Find or allocate one readable cache directory whose `source.url` records the original locator. */
async function cacheDirectory(root: string, url: string): Promise<string> {
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^reference-[1-9][0-9]*$/u.test(entry.name)) continue;
    const directory = join(root, entry.name);
    if (await readFile(join(directory, "source.url"), "utf8").catch(() => undefined) === url) return directory;
  }
  const numbers = entries.flatMap((entry) => {
    const match = /^reference-([1-9][0-9]*)$/u.exec(entry.name);
    return match === null ? [] : [Number(match[1])];
  });
  const directory = join(root, `reference-${Math.max(0, ...numbers) + 1}`);
  await mkdir(directory, { recursive: false });
  await writeFile(join(directory, "source.url"), url, "utf8");
  return directory;
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
  const directory = await cacheDirectory(root, url);

  const held = await existingDownload(directory);
  if (held !== undefined) return { path: held, url, cached: true };

  const result = spawnSync("uv", [
    "run", "--project", serviceProject(), "--frozen", "yt-dlp",
    "--no-playlist",
    "--no-progress",
    "--quiet",
    // Video and audio together, muxed. Sites serve the two separately now, so asking for the best
    // single file resolves to a video-only stream — and a reference with no audio has no transcript,
    // which is half of what the observers read. ffmpeg does the muxing and is already required by
    // everything that opens this file next.
    "--format", "bv*+ba/b",
    "--merge-output-format", "mp4",
    // Prefer H.264 at 1080 rather than requiring either. Nothing downstream reads above 720 — the
    // analysis video, the representative frames and the tails are all `scale='min(720,iw)'` — so
    // fetching a 4K source spends several hundred megabytes to make a 720p working copy. A
    // `height<=1080` filter would refuse outright when a link offers nothing under the bound, which
    // is a download that fails rather than one that is merely larger; a sort expresses the preference
    // and still resolves to whatever the link actually has.
    "--format-sort", "res:1080,vcodec:h264",
    "--output", join(directory, "%(id)s.%(ext)s"),
    url,
  ], { encoding: "utf8", windowsHide: true, timeout: 900_000 });

  if (result.error !== undefined && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new Error(
      "uv is not installed, and a reference given as a link is fetched by a pinned yt-dlp that uv "
      + "installs. It is the same tool the WhisperX and OpenCV programs need. Install it "
      + "(https://docs.astral.sh/uv/), or download the video yourself and pass the path instead.");
  }
  if (result.status !== 0) {
    throw new Error(`yt-dlp could not fetch ${url}: ${(result.stderr ?? "").trim().slice(-2000)}`);
  }

  const written = await existingDownload(directory);
  if (written === undefined) throw new Error(`yt-dlp reported success but wrote no video for ${url}`);
  return { path: written, url, cached: false };
}
