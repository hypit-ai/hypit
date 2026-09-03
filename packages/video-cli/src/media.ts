import { mkdir, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

import type { CliIo } from "@hypit/cli";
import { downloadVideo, isVideoUrl } from "@hypit/yt-dlp";

import { runProcess } from "./process.js";

/**
 * Media preparation for the eyes: dumb, local, stateless.
 *
 * A reference video is read by the Gemini Endpoint through `hypit observe`. These commands only make
 * the pieces that request needs when the whole video is too long or too dense to read at once: a
 * stretch cut to a clip, frames at chosen seconds, a grid of frames drawn large enough to read small
 * type, the pixel-jump boundaries a video shows before anyone knows what it is, and a link turned into
 * a file. Each writes exactly what the caller named and nothing else; none decides what the video is.
 */

export const mediaCommands = ["probe", "cut", "frames", "tile", "shots", "fetch"] as const;
export type MediaCommand = typeof mediaCommands[number];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function isMediaCommand(value: string | undefined): value is MediaCommand {
  return (mediaCommands as readonly string[]).includes(value ?? "");
}

function round(value: number): number { return Number(value.toFixed(3)); }
function clamp(value: number, low: number, high: number): number { return Math.max(low, Math.min(high, value)); }

// ---------------------------------------------------------------------------------------------------
// Arguments

type Parsed = {
  readonly positionals: readonly string[];
  readonly options: ReadonlyMap<string, string>;
  readonly json: boolean;
};

function parseArguments(argv: readonly string[], allowed: readonly string[]): Parsed {
  const positionals: string[] = [];
  const options = new Map<string, string>();
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (item === "--json") { json = true; continue; }
    if (item === "--debug" || item === "--verbose" || item === "--no-color") continue;
    if (item === "--color") { index += 1; continue; }
    if (!item.startsWith("--")) { positionals.push(item); continue; }
    if (!allowed.includes(item)) throw new Error(`unknown option ${item}`);
    if (options.has(item)) throw new Error(`${item} cannot be repeated`);
    const value = argv[index + 1];
    if (value === undefined || (value.startsWith("--") && value.length > 2)) throw new Error(`${item} requires a value`);
    options.set(item, value);
    index += 1;
  }
  return { positionals, options, json };
}

function required(parsed: Parsed, option: string, hint: string): string {
  const value = parsed.options.get(option);
  if (value === undefined) throw new Error(`${option} is required: ${hint}`);
  return value;
}

function secondsOption(parsed: Parsed, option: string, fallback?: number): number {
  const raw = parsed.options.get(option);
  if (raw === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${option} is required: a time in seconds`);
  }
  const value = Number(raw);
  assert(Number.isFinite(value) && value >= 0, `${option} must be a non-negative number of seconds, got ${raw}`);
  return value;
}

function integerOption(parsed: Parsed, option: string, fallback: number, low: number): number {
  const raw = parsed.options.get(option);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  assert(Number.isSafeInteger(value) && value >= low, `${option} must be a whole number of at least ${low}, got ${raw}`);
  return value;
}

async function sourceFile(parsed: Parsed, cwd: string): Promise<string> {
  const [source] = parsed.positionals;
  assert(source !== undefined, "name the media file first");
  const path = resolve(cwd, source);
  assert(await stat(path).then((item) => item.isFile(), () => false), `cannot read ${path}`);
  return path;
}

async function destination(parsed: Parsed, cwd: string, hint: string): Promise<string> {
  const to = resolve(cwd, required(parsed, "--to", hint));
  assert(!(await stat(to).then(() => true, () => false)), `Destination ${to} already exists`);
  await mkdir(dirname(to), { recursive: true });
  return to;
}

// ---------------------------------------------------------------------------------------------------
// ffmpeg

export type MediaProbe = {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
  readonly hasAudio: boolean;
};

export async function probeMedia(path: string): Promise<MediaProbe> {
  const raw = await runProcess("ffprobe", [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate", "-of", "json", path,
  ]);
  const parsed = JSON.parse(raw.toString("utf8")) as {
    format?: { duration?: string };
    streams?: readonly { codec_type?: string; width?: number; height?: number; r_frame_rate?: string }[];
  };
  const video = parsed.streams?.find((item) => item.codec_type === "video");
  const duration = Number(parsed.format?.duration);
  assert(Number.isFinite(duration) && duration > 0, `${path}: duration is unavailable`);
  assert(video?.width !== undefined && video.height !== undefined, `${path}: no video stream`);
  // ffprobe reports the rate as a ratio; a still image reports none.
  const ratio = (video.r_frame_rate ?? "").split("/");
  const rate = Number(ratio[0]) / Number(ratio[1] ?? 1);
  return {
    duration: round(duration),
    width: video.width,
    height: video.height,
    frameRate: Number.isFinite(rate) && rate > 0 ? round(rate) : 0,
    hasAudio: parsed.streams?.some((item) => item.codec_type === "audio") ?? false,
  };
}

/**
 * Open `source` on the frame at `at` seconds.
 *
 * `-ss` after `-i` alone decodes every frame up to the mark; `-ss` before `-i` alone lands on the
 * keyframe before it. Jumping to two seconds early and decoding the short run-up lands on the exact
 * frame: measured on a 1080p source nine minutes in, the same JPEG to the byte, 11.6 s to 0.2 s.
 */
const SEEK_RUN_UP = 2;
function openAt(source: string, at: number): readonly string[] {
  const jump = Math.max(0, at - SEEK_RUN_UP);
  const runUp = at - jump;
  return [...(jump > 0 ? ["-ss", String(round(jump))] : []), "-i", source, ...(runUp > 0 ? ["-ss", String(round(runUp))] : [])];
}

// JPEG is a full-range format; web video is routinely full-range YUV and the encoder refuses it
// unless told which it is writing (`Non full-range YUV is non-standard`).
const JPEG = ["-pix_fmt", "yuvj420p", "-q:v", "3"] as const;

export async function cutClip(source: string, start: number, end: number, target: string): Promise<void> {
  assert(end > start, `the clip must end after it starts (${start} to ${end})`);
  await runProcess("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", ...openAt(source, start), "-t", String(round(end - start)),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", target,
  ]);
}

export async function cutFrame(source: string, at: number, target: string): Promise<void> {
  await runProcess("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...openAt(source, at), "-frames:v", "1", ...JPEG, target]);
}

const TILE_COLUMNS = 3;
const TILE_CELL_WIDTH = 480;
/** Four frames show what moves in a one-second shot; nine keep a fifteen-second one legible. */
export function tileFrameCount(seconds: number): number { return clamp(Math.round(seconds * 1.5), 4, 9); }

export async function tileFrames(
  source: string,
  start: number,
  end: number,
  target: string,
  cellWidth: number,
  frameCount: number,
): Promise<void> {
  assert(end > start, `the stretch must end after it starts (${start} to ${end})`);
  const seconds = end - start;
  const rows = Math.ceil(frameCount / TILE_COLUMNS);
  const rate = frameCount / Math.max(seconds, 0.1);
  await runProcess("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", ...openAt(source, start), "-t", String(round(seconds)),
    "-vf", `fps=${rate},scale='min(${Math.round(cellWidth)},iw)':-2,tile=layout=${TILE_COLUMNS}x${rows}:padding=8:margin=8:color=black`,
    "-frames:v", "1", ...JPEG, target,
  ]);
}

/**
 * Where the picture jumps, at 12 samples per second of 32×32 signatures.
 *
 * At three samples a second a boundary overshot by a third of a second, long enough for an observer
 * to describe a shot as the picture before it. A jump closer than one second to the previous one is a
 * flicker, flash frame or fast pan rather than a shot, and a clip that short is refused by the model
 * anyway; a final fragment that short belongs to the shot before it.
 */
const SAMPLE_RATE = 12;
const SHORTEST_SHOT = 1;
export async function shotBoundaries(source: string, duration: number): Promise<readonly { readonly start: number; readonly end: number }[]> {
  const bytes = await runProcess("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", source, "-vf", `fps=${SAMPLE_RATE},scale=32:32,format=rgb24`, "-f", "rawvideo", "-",
  ]);
  const stride = 32 * 32 * 3;
  const frames: Uint8Array[] = [];
  for (let index = 0; index + stride <= bytes.byteLength; index += stride) frames.push(bytes.subarray(index, index + stride));
  const starts = [0];
  if (frames.length >= 2) {
    let anchor = frames[0]!;
    for (let index = 1; index < frames.length; index += 1) {
      const frame = frames[index]!;
      let total = 0;
      for (let byte = 0; byte < frame.length; byte += 1) total += Math.abs(frame[byte]! - anchor[byte]!);
      if (total / frame.length / 255 > 0.1) {
        const at = round(index / SAMPLE_RATE);
        if (at - starts.at(-1)! >= SHORTEST_SHOT) starts.push(at);
        anchor = frame;
      }
    }
  }
  if (starts.length > 1 && duration - starts.at(-1)! < SHORTEST_SHOT) starts.pop();
  return starts.map((start, index) => ({ start, end: round(starts[index + 1] ?? duration) }));
}

// ---------------------------------------------------------------------------------------------------
// Commands

async function probe(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, []);
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  if (parsed.json) { io.write(`${JSON.stringify({ path: source, ...info }, null, 2)}\n`); return; }
  io.write(`${source}\n  ${info.duration} s  ${info.width}×${info.height}  ${info.frameRate > 0 ? `${info.frameRate} fps` : "still"}  ${info.hasAudio ? "with audio" : "no audio"}\n`);
}

async function cut(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, ["--start", "--end", "--to"]);
  const source = await sourceFile(parsed, cwd);
  const start = secondsOption(parsed, "--start", 0);
  const info = await probeMedia(source);
  const end = secondsOption(parsed, "--end", info.duration);
  assert(end <= info.duration + 0.001, `--end ${end} is past the end of the file (${info.duration} s)`);
  const target = await destination(parsed, cwd, "the clip to write, for example notes/hook.mp4");
  await cutClip(source, start, end, target);
  if (parsed.json) { io.write(`${JSON.stringify({ path: target, start, end, seconds: round(end - start) }, null, 2)}\n`); return; }
  io.write(`${target}\n  ${start} s to ${end} s (${round(end - start)} s)\n`);
}

async function frames(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, ["--at", "--every", "--to"]);
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  const at = parsed.options.get("--at");
  const every = parsed.options.get("--every");
  assert((at === undefined) !== (every === undefined), "name the seconds with --at <s,s,…> or sample with --every <seconds>, not both");
  let times: number[];
  if (at !== undefined) {
    times = at.split(",").map((item) => Number(item.trim()));
    assert(times.every((value) => Number.isFinite(value) && value >= 0), `--at must list seconds, got ${at}`);
  } else {
    const step = Number(every);
    assert(Number.isFinite(step) && step > 0, `--every must be a positive number of seconds, got ${every}`);
    times = [];
    for (let time = 0; time < info.duration; time += step) times.push(round(time));
  }
  assert(times.every((value) => value <= info.duration), `a time is past the end of the file (${info.duration} s)`);
  const to = resolve(cwd, required(parsed, "--to", "the directory to write the frames into"));
  assert(!(await stat(to).then((item) => item.isFile(), () => false)), `${to} is a file; --to names a directory`);
  await mkdir(to, { recursive: true });
  const written: { readonly at: number; readonly path: string }[] = [];
  for (const time of times) {
    const target = join(to, `frame-${time.toFixed(2).replace(".", "_")}s.jpg`);
    assert(!(await stat(target).then(() => true, () => false)), `${target} already exists`);
    await cutFrame(source, time, target);
    written.push({ at: time, path: target });
  }
  if (parsed.json) { io.write(`${JSON.stringify({ directory: to, frames: written }, null, 2)}\n`); return; }
  io.write(`${to}\n${written.map((item) => `  ${item.at} s  ${item.path}`).join("\n")}\n`);
}

async function tile(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, ["--start", "--end", "--frames", "--cell", "--to"]);
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  const start = secondsOption(parsed, "--start", 0);
  const end = secondsOption(parsed, "--end", info.duration);
  assert(end <= info.duration + 0.001, `--end ${end} is past the end of the file (${info.duration} s)`);
  const count = integerOption(parsed, "--frames", tileFrameCount(end - start), 2);
  // Never enlarge a small source: a grid drawn wider than the video carries the same pixels as more.
  const cell = integerOption(parsed, "--cell", Math.min(TILE_CELL_WIDTH, info.width), 64);
  const target = await destination(parsed, cwd, "the grid image to write, for example notes/hook-grid.jpg");
  await tileFrames(source, start, end, target, cell, count);
  const rows = Math.ceil(count / TILE_COLUMNS);
  if (parsed.json) { io.write(`${JSON.stringify({ path: target, start, end, frames: count, columns: TILE_COLUMNS, rows, cellWidth: cell }, null, 2)}\n`); return; }
  io.write(`${target}\n  ${count} frames from ${start} s to ${end} s, ${TILE_COLUMNS}×${rows}, ${cell} px cells, reading order left to right then top to bottom\n`);
}

async function shots(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, []);
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  const bounds = await shotBoundaries(source, info.duration);
  if (parsed.json) { io.write(`${JSON.stringify({ path: source, shots: bounds }, null, 2)}\n`); return; }
  io.write(`${source}\n  ${bounds.length} pixel-jump ${bounds.length === 1 ? "stretch" : "stretches"}; a jump is not a shot until the eyes say so\n${
    bounds.map((bound, index) => `  ${String(index + 1).padStart(3, " ")}  ${bound.start} s to ${bound.end} s  (${round(bound.end - bound.start)} s)`).join("\n")}\n`);
}

async function fetch(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, ["--to"]);
  const [url] = parsed.positionals;
  assert(url !== undefined && isVideoUrl(url), "name an http or https link first");
  const target = await destination(parsed, cwd, "the video file to write, for example reference/source.mp4");
  assert([".mp4", ".mkv", ".webm", ".mov"].includes(extname(target).toLowerCase()), "--to must end in .mp4, .mkv, .webm or .mov");
  await downloadVideo(url, target);
  const info = await probeMedia(target);
  if (parsed.json) { io.write(`${JSON.stringify({ path: target, url, ...info }, null, 2)}\n`); return; }
  io.write(`${target}\n  ${info.duration} s  ${info.width}×${info.height}  ${info.hasAudio ? "with audio" : "no audio"}\n`);
}

// ---------------------------------------------------------------------------------------------------
// Entry

export function writeMediaHelp(io: CliIo, topic?: MediaCommand): void {
  const sections: Record<MediaCommand, readonly string[]> = {
    probe: ["  hypit media probe <file>", "    Duration, size, frame rate and whether there is audio."],
    cut: ["  hypit media cut <file> --start <s> --end <s> --to <clip.mp4>", "    One stretch as a clip of its own, cut on the exact frames."],
    frames: ["  hypit media frames <file> (--at <s,s,…> | --every <s>) --to <dir>", "    Single frames at those seconds, as JPEG files named by their time."],
    tile: ["  hypit media tile <file> [--start <s> --end <s>] [--frames <n>] [--cell <px>] --to <grid.jpg>",
      "    Frames sampled evenly across a stretch, in one grid read left to right then top to bottom.",
      "    Defaults: 4 to 9 frames at 1.5 per second, 480 px cells, never wider than the source."],
    shots: ["  hypit media shots <file>", "    Where the picture jumps. A starting point when nothing is known yet; not a shot list."],
    fetch: ["  hypit media fetch <url> --to <video.mp4>", "    A link turned into a file with the pinned yt-dlp, video and audio together."],
  };
  const chosen = topic === undefined ? mediaCommands : [topic];
  io.write(`hypit media\nPrepare what the eyes will look at. Local ffmpeg work; no Runtime Profile, no request, no state.\n\n${
    chosen.map((item) => sections[item].join("\n")).join("\n\n")}\n\nEvery command writes only what --to names and refuses to overwrite. Add --json for a machine view.\n`);
}

export async function runMediaCli(argv: readonly string[], io: CliIo, cwd = process.cwd()): Promise<void> {
  const command = argv[1];
  if (command === undefined || command === "--help" || argv.includes("--help")) {
    writeMediaHelp(io, isMediaCommand(command) ? command : undefined);
    return;
  }
  assert(isMediaCommand(command), `unknown media command ${command}; one of ${mediaCommands.join(", ")}`);
  const rest = argv.slice(2);
  if (command === "probe") await probe(rest, io, cwd);
  else if (command === "cut") await cut(rest, io, cwd);
  else if (command === "frames") await frames(rest, io, cwd);
  else if (command === "tile") await tile(rest, io, cwd);
  else if (command === "shots") await shots(rest, io, cwd);
  else await fetch(rest, io, cwd);
}
