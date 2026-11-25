/**
 * Fetch a video that lives at a link rather than on disk.
 *
 * Most of the videos anybody wants to reconstruct are on TikTok, YouTube, Instagram or Bilibili
 * rather than in a folder. `yt-dlp` is what turns one into a file; everything after that reads the
 * file and never learns where it came from.
 *
 * The tool is a pinned Python dependency prepared explicitly by `hypit download prepare`, not a
 * binary the machine happens to carry. `yt-dlp` releases constantly because it is chasing sites that
 * keep changing, so an unpinned copy makes the same link fetch differently on two machines. This is
 * the same shape WhisperX and OpenCV already use for their Python programs.
 */
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import { requireVideoDownload } from "./environment.js";

function runExec(file: string, args: readonly string[], options: { readonly timeout?: number; readonly maxBuffer?: number; readonly signal?: AbortSignal | undefined } = {}): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { encoding: "utf8", windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error !== null) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

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
 * Fetch one video into exactly the file the caller named.
 *
 * Video and audio are asked for together and muxed: sites serve the two separately now, so the best
 * single file resolves to a video-only stream, and a video with no audio has no transcript. H.264 at
 * 1080 is preferred rather than required; a `height<=1080` filter would refuse a link that offers
 * nothing under the bound. `--no-playlist` keeps a link inside a playlist from fetching the playlist.
 * The container follows the target's extension. The merge format applies only when two streams are
 * muxed; a site serving one muxed file resolves to `b`, so that file is remuxed into the container.
 */
export async function downloadVideo(url: string, target: string, options: { readonly signal?: AbortSignal } = {}): Promise<void> {
  const container = extname(target).slice(1).toLowerCase();
  if (!["mp4", "mkv", "webm", "mov"].includes(container)) {
    throw new Error(`${target} must end in .mp4, .mkv, .webm or .mov`);
  }
  const executable = requireVideoDownload();
  try {
    await runExec("ffmpeg", ["-version"], { timeout: 15_000, signal: options.signal });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error("FFmpeg is unavailable on PATH; install your selected media toolchain before fetching video");
  }
  const work = await mkdtemp(join(tmpdir(), "hypit-fetch-"));
  try {
    try {
      await runExec(executable, [
        "--ignore-config", "--no-update", "--no-remote-components", "--no-plugin-dirs",
        "--no-js-runtimes", "--js-runtimes", `node:${process.execPath}`,
        "--no-playlist", "--no-progress", "--quiet",
        "--format", "bv*+ba/b",
        "--merge-output-format", container,
        "--remux-video", container,
        "--format-sort", "res:1080,vcodec:h264",
        "--output", join(work, "video.%(ext)s"),
        url,
      ], { timeout: 900_000, maxBuffer: 10 * 1024 * 1024, signal: options.signal });
    } catch (cause) {
      if (options.signal?.aborted) throw cause;
      const error = cause as { stderr?: string; message?: string };
      throw new Error(`yt-dlp could not fetch ${url}: ${(error.stderr ?? error.message ?? "").trim().slice(-2000)}`);
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
