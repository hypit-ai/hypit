import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function round(value: number): number { return Number(value.toFixed(3)); }
export function clamp(value: number, low: number, high: number): number { return Math.max(low, Math.min(high, value)); }

export async function ensureDir(path: string): Promise<void> { await mkdir(path, { recursive: true }); }

export async function command(executable: string, args: readonly string[], timeoutMs = 120_000): Promise<Buffer> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, [...args], { stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true });
    const stdout: Buffer[] = [];
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(new Error(`${executable} timed out`)); }, timeoutMs);
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error !== undefined) reject(error);
      else resolvePromise(Buffer.concat(stdout));
    };
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-1_000_000); });
    child.on("error", (error) => finish(error instanceof Error ? error : new Error(String(error))));
    child.on("close", (code) => code === 0 ? finish() : finish(new Error(`${executable} failed (${code}): ${stderr.trim()}`)));
  });
}

export async function probe(path: string): Promise<{ duration: number; width: number; height: number; frameRate: number; hasAudio: boolean }> {
  const raw = await command("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate", "-of", "json", path]);
  const parsed = JSON.parse(raw.toString("utf8")) as { format?: { duration?: string }; streams?: readonly { codec_type?: string; width?: number; height?: number; r_frame_rate?: string }[] };
  const video = parsed.streams?.find((item) => item.codec_type === "video");
  const duration = Number(parsed.format?.duration);
  assert(Number.isFinite(duration) && duration > 0, "video duration is unavailable");
  assert(video?.width !== undefined && video.height !== undefined, "video dimensions are unavailable");
  // ffprobe reports the rate as a ratio, so it is divided rather than parsed as a number. A still
  // image has no rate to report and a caller that needs one asks for it from a clip.
  const ratio = (video.r_frame_rate ?? "").split("/");
  const rate = Number(ratio[0]) / Number(ratio[1] ?? 1);
  return {
    duration, width: video.width, height: video.height,
    frameRate: Number.isFinite(rate) && rate > 0 ? rate : 0,
    hasAudio: parsed.streams?.some((item) => item.codec_type === "audio") ?? false,
  };
}

/**
 * Whether a clip holds one picture for the whole of its length.
 *
 * `freezedetect` reports each stretch it saw no change across as a start, and as an end where the
 * picture changes again. One stretch that opens on the first frame and never closes is the whole
 * clip; a stretch that opens later, or one that closes before the clip does, means something moved.
 * The times are measured to a frame, so an end landing on the last frame is the clip ending.
 */
export async function completelyStill(path: string): Promise<boolean> {
  const { duration, frameRate } = await probe(path);
  // The filter announces a stretch only once it has run for `d`, and announces it at the second it
  // began rather than the second it was noticed, so `d` has only to be shorter than the clip.
  // `metadata=print` writes what it found to stdout, which is where the result is read from.
  const printed = await command("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", path, "-an",
    "-vf", "freezedetect=n=-60dB:d=0.1,metadata=mode=print:file=-", "-f", "null", "-",
  ], 300_000);
  const text = printed.toString("utf8");
  const times = (name: string): readonly number[] =>
    [...text.matchAll(new RegExp(String.raw`freezedetect\.freeze_${name}=([0-9.]+)`, "gu"))].map((match) => Number(match[1]));
  const tolerance = frameRate > 0 ? 1 / frameRate : 0.05;
  const starts = times("start");
  return starts.length === 1 && starts[0]! <= tolerance && times("end").every((at) => at >= duration - tolerance);
}

function distance(left: Uint8Array, right: Uint8Array): number {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index]! - right[index]!);
  return total / left.length / 255;
}

async function signatures(path: string, sampleRate: number): Promise<readonly Uint8Array[]> {
  const bytes = await command("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path, "-vf", `fps=${sampleRate},scale=32:32,format=rgb24`, "-f", "rawvideo", "-"]);
  const stride = 32 * 32 * 3;
  const result: Uint8Array[] = [];
  for (let index = 0; index + stride <= bytes.byteLength; index += stride) result.push(bytes.subarray(index, index + stride));
  return result;
}

// Boundaries are only as precise as this rate, and a clip cut on an imprecise boundary opens on
// content belonging to the shot before it. At three samples a second that overhang reached a third
// of a second — long enough for an observer to describe a shot as the picture that precedes it, and
// to read a list that had been typing all along as one whose letters were being deleted. The whole
// video is decoded once whatever the rate, so sampling four times as often costs four times as many
// 32×32 signatures and no additional decoding.
const SAMPLE_RATE = 12;

async function contentBoundaries(path: string, duration: number): Promise<readonly number[]> {
  const frames = await signatures(path, SAMPLE_RATE);
  if (frames.length < 2) return [0, duration];
  const starts = [0];
  let anchor = frames[0]!;
  for (let index = 1; index < frames.length; index += 1) {
    if (distance(frames[index]!, anchor) > 0.1) {
      starts.push(round(index / SAMPLE_RATE));
      anchor = frames[index]!;
    }
  }
  // A boundary closer than this to the one before it does not describe a shot: it describes a
  // flicker, a flash frame or a fast pan. Clips that short are also rejected outright by the model,
  // so admitting them costs a request and returns nothing.
  const shortest = 1;
  const kept = [starts[0]!];
  for (const value of starts.slice(1)) {
    if (value - kept.at(-1)! >= shortest) kept.push(value);
  }
  // The tail is a boundary too, and a final fragment belongs to the shot before it rather than
  // becoming a shot of its own.
  if (duration - kept.at(-1)! < shortest && kept.length > 1) kept.pop();
  return [...kept, duration];
}

type Bounds = { readonly start: number; readonly end: number; readonly group: number; readonly part: number; readonly parts: number };
function splitLong(boundaries: readonly number[]): readonly Bounds[] {
  const result: Bounds[] = [];
  for (let group = 0; group + 1 < boundaries.length; group += 1) {
    const start = boundaries[group]!;
    const end = boundaries[group + 1]!;
    const length = end - start;
    const parts = Math.max(1, Math.ceil(length / 15));
    for (let part = 0; part < parts; part += 1) result.push({ start: round(start + length * part / parts), end: round(start + length * (part + 1) / parts), group, part: part + 1, parts });
  }
  return result;
}

async function extract(path: string, args: readonly string[], target: string): Promise<string> {
  await command("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args, target], 300_000);
  return target;
}

// An observer that reads images rather than video sees a shot as this many frames, sampled evenly
// across it and tiled into one picture in reading order. Four is enough for a one-second shot to
// show what moves; nine keeps a fifteen-second one legible at a cell width a reader can still resolve
// detail in. The clip is decoded once, and the sampling and the tiling happen in that one pass.
const TILE_COLUMNS = 3;
export function tileFrames(duration: number): number { return clamp(Math.round(duration * 1.5), 4, 9); }

/**
 * One stretch of a video, as a clip of its own.
 *
 * `-ss` goes after `-i` for the same reason it does when a shot is cut: seeking the output decodes
 * from the start and lands on the frame asked for, where seeking the input lands on the keyframe
 * before it. Both sides of a comparison are cut this way, so a difference between them is a
 * difference in the pictures rather than in how far each one overshot its start.
 */
export async function cutClip(source: string, start: number, seconds: number, target: string): Promise<string> {
  return await extract(source, [
    "-i", source, "-ss", String(round(start)), "-t", String(Math.max(0.1, round(seconds))),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
  ], target);
}

/** One frame of a video, at the second asked for. */
export async function cutFrame(source: string, at: number, target: string): Promise<string> {
  return await extract(source, ["-i", source, "-ss", String(round(at)), "-frames:v", "1", "-q:v", "3"], target);
}

export async function shotTile(clip: string, duration: number, target: string): Promise<string> {
  const frames = tileFrames(duration);
  const rows = Math.ceil(frames / TILE_COLUMNS);
  const rate = round(frames / Math.max(duration, 0.1));
  await command("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", clip,
    "-vf", `fps=${rate},scale=480:-2,tile=layout=${TILE_COLUMNS}x${rows}:padding=8:margin=8:color=black`,
    "-frames:v", "1", "-q:v", "3", target,
  ], 300_000);
  return target;
}

export async function prepareMedia(videoPath: string, root: string, duration: number, tiles: boolean): Promise<{
  readonly bounds: readonly Bounds[];
  readonly storyboard: string;
  readonly analysisVideo: string;
}> {
  const boundaries = await contentBoundaries(videoPath, duration);
  const bounds = splitLong(boundaries);
  await ensureDir(root);
  const analysisVideo = await extract(videoPath, ["-i", videoPath, "-vf", "scale='min(720,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-c:a", "aac", "-b:a", "64k"], join(root, "analysis.mp4"));
  const shotDir = join(root, "shots");
  await ensureDir(shotDir);
  await Promise.all(bounds.map(async (bound, index) => {
    const id = String(index + 1).padStart(3, "0");
    const clip = join(shotDir, `${id}.mp4`);
    // `-ss` goes after `-i`: seeking the output decodes from the start and lands on the frame asked
    // for, where seeking the input lands on the keyframe before it.
    await extract(videoPath, ["-i", videoPath, "-ss", String(bound.start), "-t", String(Math.max(0.1, bound.end - bound.start)), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"], clip);
    await extract(videoPath, ["-i", videoPath, "-ss", String(bound.start + (bound.end - bound.start) / 2), "-frames:v", "1", "-vf", "scale='min(720,iw)':-2", "-q:v", "3"], join(shotDir, `${id}-representative.jpg`));
    await extract(videoPath, ["-sseof", "-0.1", "-i", clip, "-update", "1", "-frames:v", "1", "-vf", "scale='min(720,iw)':-2", "-q:v", "3"], join(shotDir, `${id}-tail.jpg`));
    // Only the observer that reads pictures has anything to read them from, and building a tile per
    // shot is a decode per shot. The other observer is handed the clip itself.
    if (tiles) await shotTile(clip, bound.end - bound.start, join(shotDir, `${id}-frames.jpg`));
    if (await hasAudio(clip)) await extract(videoPath, ["-sseof", "-3", "-i", clip, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"], join(shotDir, `${id}-audio.wav`));
  }));
  const inputs = bounds.map((_, index) => `[${index}:v]`).join("");
  const list = bounds.flatMap((_, index) => ["-i", join(shotDir, `${String(index + 1).padStart(3, "0")}-representative.jpg`)]);
  const columns = Math.min(4, bounds.length);
  const rows = Math.ceil(bounds.length / columns);
  const storyboard = join(root, "storyboard.jpg");
  await command("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...list, "-filter_complex", `${inputs}concat=n=${bounds.length}:v=1:a=0,tile=layout=${columns}x${rows}:padding=8:margin=8`, "-frames:v", "1", storyboard]);
  return { bounds, storyboard, analysisVideo };
}

async function hasAudio(path: string): Promise<boolean> {
  try { await command("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", path]); return true; } catch { return false; }
}

export async function readBytes(path: string): Promise<Uint8Array> { return await readFile(path); }
export async function writeJson(path: string, value: unknown): Promise<void> { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
export async function readJson<T>(path: string): Promise<T | undefined> { try { return JSON.parse(await readFile(path, "utf8")) as T; } catch { return undefined; } }
export async function referenceId(videoPath: string): Promise<string> {
  const info = await stat(videoPath);
  const value = `${resolve(videoPath)}\u0000${info.size}\u0000${info.mtimeMs}`;
  return `ref-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}
