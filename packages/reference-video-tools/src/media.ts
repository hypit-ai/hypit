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
    const child = spawn(executable, [...args], { stdio: ["ignore", "pipe", "pipe"], shell: false });
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

export async function probe(path: string): Promise<{ duration: number; width: number; height: number; hasAudio: boolean }> {
  const raw = await command("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", path]);
  const parsed = JSON.parse(raw.toString("utf8")) as { format?: { duration?: string }; streams?: readonly { codec_type?: string; width?: number; height?: number }[] };
  const video = parsed.streams?.find((item) => item.codec_type === "video");
  const duration = Number(parsed.format?.duration);
  assert(Number.isFinite(duration) && duration > 0, "video duration is unavailable");
  assert(video?.width !== undefined && video.height !== undefined, "video dimensions are unavailable");
  return { duration, width: video.width, height: video.height, hasAudio: parsed.streams?.some((item) => item.codec_type === "audio") ?? false };
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

async function contentBoundaries(path: string, duration: number): Promise<readonly number[]> {
  const frames = await signatures(path, 3);
  if (frames.length < 2) return [0, duration];
  const starts = [0];
  let anchor = frames[0]!;
  for (let index = 1; index < frames.length; index += 1) {
    if (distance(frames[index]!, anchor) > 0.1) {
      starts.push(round(index / 3));
      anchor = frames[index]!;
    }
  }
  return [...starts, duration].filter((value, index, all) => index === 0 || value - all[index - 1]! > 0.3);
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

export async function prepareMedia(videoPath: string, root: string, duration: number): Promise<{
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
    await extract(videoPath, ["-ss", String(bound.start), "-i", videoPath, "-t", String(Math.max(0.1, bound.end - bound.start)), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"], clip);
    await extract(videoPath, ["-ss", String(bound.start + (bound.end - bound.start) / 2), "-i", videoPath, "-frames:v", "1", "-vf", "scale='min(720,iw)':-2", "-q:v", "3"], join(shotDir, `${id}-representative.jpg`));
    await extract(videoPath, ["-sseof", "-0.1", "-i", clip, "-update", "1", "-frames:v", "1", "-vf", "scale='min(720,iw)':-2", "-q:v", "3"], join(shotDir, `${id}-tail.jpg`));
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
