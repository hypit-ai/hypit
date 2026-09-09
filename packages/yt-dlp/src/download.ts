/**
 * Fetch a video that lives at a link rather than on disk.
 *
 * Most of the videos anybody wants to reconstruct are on TikTok, YouTube, Instagram or Bilibili
 * rather than in a folder. `yt-dlp` is what turns one into a file; everything after that reads the
 * file and never learns where it came from.
 *
 * The tool is a pinned Python dependency under `services/yt-dlp`, reached through `uv`, and not a
 * binary the machine happens to carry. `yt-dlp` releases constantly because it is chasing sites that
 * keep changing, so an unpinned copy makes the same link fetch differently on two machines. This is
 * the same shape WhisperX and OpenCV already use for their Python programs.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Whether this is a link to fetch rather than a path to open.
 *
 * Only `http` and `https`. A Windows path opens as a URL with a single-letter scheme (`c:\clip.mp4`
 * parses with protocol `c:`), and reading that as a link would hand the whole path to `yt-dlp` and
 * report a network failure for a file sitting on the disk.
 */
export function isVideoUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The uv project holding the pinned `yt-dlp`, found by walking up from this module rather than from
 * the working directory, which is wherever the author happened to run the command from.
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

/**
 * Fetch one video into exactly the file the caller named.
 *
 * Video and audio are asked for together and muxed: sites serve the two separately now, so the best
 * single file resolves to a video-only stream, and a video with no audio has no transcript. H.264 at
 * 1080 is preferred rather than required; a `height<=1080` filter would refuse a link that offers
 * nothing under the bound. `--no-playlist` keeps a link inside a playlist from fetching the playlist.
 * The container follows the target's extension.
 */
export async function downloadVideo(url: string, target: string): Promise<void> {
  const container = extname(target).slice(1).toLowerCase();
  if (!["mp4", "mkv", "webm", "mov"].includes(container)) {
    throw new Error(`${target} must end in .mp4, .mkv, .webm or .mov`);
  }
  const work = await mkdtemp(join(tmpdir(), "hypit-fetch-"));
  try {
    const result = spawnSync("uv", [
      "run", "--project", serviceProject(), "--frozen", "yt-dlp",
      "--no-playlist", "--no-progress", "--quiet",
      "--format", "bv*+ba/b",
      "--merge-output-format", container,
      "--format-sort", "res:1080,vcodec:h264",
      "--output", join(work, "video.%(ext)s"),
      url,
    ], { encoding: "utf8", windowsHide: true, timeout: 900_000 });

    if (result.error !== undefined && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "uv is not installed, and a link is fetched by a pinned yt-dlp that uv installs. It is the same "
        + "tool the WhisperX and OpenCV programs need. Install it (https://docs.astral.sh/uv/), or download "
        + "the video yourself and pass the path instead.");
    }
    if (result.status !== 0) {
      throw new Error(`yt-dlp could not fetch ${url}: ${(result.stderr ?? "").trim().slice(-2000)}`);
    }
    const finished = (await readdir(work)).filter((name) => !name.endsWith(".part"));
    const [file] = finished.sort();
    if (file === undefined) throw new Error(`yt-dlp reported success for ${url} but wrote no file`);
    const staged = join(work, file);
    try {
      await rename(staged, target);
    } catch (cause) {
      // Staging lives in the OS temp directory, which is often on a different volume from the
      // project. A rename cannot cross volumes, so copy the bytes over instead; the staging
      // directory is removed either way.
      if ((cause as NodeJS.ErrnoException).code !== "EXDEV") throw cause;
      await copyFile(staged, target);
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
