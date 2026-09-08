import { mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

import type { CliIo } from "@hypit/cli";
import { downloadVideo, isVideoUrl } from "@hypit/yt-dlp";
import sharp from "sharp";

import { runProcess, runProcessOutput, runProcessWithInput } from "./process.js";
import { phraseRanges, readTranscript, wordsAt } from "./transcript.js";
import type { FrameWords, TranscriptWord } from "./transcript.js";

/**
 * Local views of media at chosen times and scales. Transcript annotations use the same seconds as
 * the input media. These commands expose evidence; editorial interpretation belongs to the author.
 */

export const mediaCommands = ["probe", "cut", "frames", "tile", "tiles", "boundaries", "fetch"] as const;
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
  readonly flags: ReadonlySet<string>;
  readonly json: boolean;
};

function parseArguments(argv: readonly string[], allowed: readonly string[], allowedFlags: readonly string[] = []): Parsed {
  const positionals: string[] = [];
  const options = new Map<string, string>();
  const flags = new Set<string>();
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (item === "--json") { json = true; continue; }
    if (item === "--debug" || item === "--verbose" || item === "--no-color") continue;
    if (item === "--color") { index += 1; continue; }
    if (!item.startsWith("--")) { positionals.push(item); continue; }
    if (allowedFlags.includes(item)) {
      if (flags.has(item)) throw new Error(`${item} cannot be repeated`);
      flags.add(item);
      continue;
    }
    if (!allowed.includes(item)) throw new Error(`unknown option ${item}`);
    if (options.has(item)) throw new Error(`${item} cannot be repeated`);
    const value = argv[index + 1];
    if (value === undefined || (value.startsWith("--") && value.length > 2)) throw new Error(`${item} requires a value`);
    options.set(item, value);
    index += 1;
  }
  return { positionals, options, flags, json };
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

function numberOption(parsed: Parsed, option: string, fallback: number, low: number, high: number): number {
  const raw = parsed.options.get(option);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  assert(Number.isFinite(value) && value >= low && value <= high, `${option} must be between ${low} and ${high}, got ${raw}`);
  return value;
}

function secondsList(raw: string, option: string, minimum: number): number[] {
  const parts = raw.split(",").map((item) => item.trim());
  assert(parts.length >= minimum && parts.every((item) => item.length > 0), `${option} must list at least ${minimum} seconds, got ${raw}`);
  const values = parts.map(Number);
  assert(values.every((value) => Number.isFinite(value) && value >= 0), `${option} must list non-negative seconds, got ${raw}`);
  return values;
}

async function sourceFile(parsed: Parsed, cwd: string): Promise<string> {
  const [source] = parsed.positionals;
  assert(source !== undefined, "name the media file first");
  assert(parsed.positionals.length === 1, "media commands take exactly one media file");
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

async function destinationDirectory(parsed: Parsed, cwd: string, hint: string): Promise<string> {
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

const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "0": ["11111", "10001", "10011", "10101", "11001", "10001", "11111"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["11110", "00001", "00001", "11110", "10000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01111", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "11110"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00100", "00100"],
};

function timecode(seconds: number): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1_000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const wholeSeconds = Math.floor(milliseconds / 1_000) % 60;
  const remainder = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(remainder).padStart(3, "0")}`;
}

type RasterLabel = {
  readonly width: number;
  readonly height: number;
  readonly bytes: Buffer;
};

/** A tiny built-in numeric face keeps evidence labels available even when ffmpeg lacks drawtext. */
function rasterLabel(text: string, requestedWidth?: number): RasterLabel {
  const scale = requestedWidth === undefined
    ? 3
    : clamp(Math.min(Math.floor((requestedWidth - 8) / (text.length * 6)), Math.floor(requestedWidth / 240) + 1), 1, 3);
  const padding = scale * 2;
  const naturalWidth = padding * 2 + text.length * 6 * scale - scale;
  const width = Math.max(requestedWidth ?? naturalWidth, naturalWidth);
  const rawHeight = padding * 2 + 7 * scale;
  const height = rawHeight + rawHeight % 2;
  const bytes = Buffer.alloc(width * height * 3, 12);
  let left = padding;
  for (const character of text) {
    const glyph = GLYPHS[character];
    assert(glyph !== undefined, `cannot draw time label character ${character}`);
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row]!.length; column += 1) {
        if (glyph[row]![column] !== "1") continue;
        for (let y = 0; y < scale; y += 1) {
          for (let x = 0; x < scale; x += 1) {
            const pixel = ((padding + row * scale + y) * width + left + column * scale + x) * 3;
            bytes[pixel] = 245;
            bytes[pixel + 1] = 245;
            bytes[pixel + 2] = 245;
          }
        }
      }
    }
    left += 6 * scale;
  }
  return { width, height, bytes };
}

function rawVideoInput(label: RasterLabel, frameRate: number): readonly string[] {
  return [
    "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", `${label.width}x${label.height}`,
    "-framerate", String(frameRate), "-i", "pipe:0",
  ];
}

export async function cutClip(
  source: string,
  start: number,
  end: number,
  target: string,
  labelInfo?: Pick<MediaProbe, "frameRate">,
): Promise<void> {
  assert(end > start, `the clip must end after it starts (${start} to ${end})`);
  const seconds = round(end - start);
  const common = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"];
  if (labelInfo === undefined) {
    await runProcess("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", ...openAt(source, start), "-t", String(seconds), ...common, target,
    ]);
    return;
  }
  const temporary = await mkdtemp(join(tmpdir(), "hypit-labeled-clip-"));
  const clean = join(temporary, "clean.mp4");
  try {
    await cutClip(source, start, end, clean);
    const rate = clamp(Math.ceil(labelInfo.frameRate || 10), 1, 30);
    const count = Math.max(1, Math.ceil(seconds * rate));
    const first = rasterLabel(timecode(start));
    function* labels(): Iterable<Uint8Array> {
      yield first.bytes;
      for (let index = 1; index < count; index += 1) yield rasterLabel(timecode(start + index / rate)).bytes;
    }
    await runProcessWithInput("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", clean, ...rawVideoInput(first, rate),
      "-t", String(seconds), "-filter_complex", "[0:v][1:v]overlay=8:8:eof_action=repeat[v]",
      "-map", "[v]", "-map", "0:a?", ...common, target,
    ], labels());
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function cutFrame(source: string, at: number, target: string, labelTime = false): Promise<number> {
  if (!labelTime) {
    const jump = Math.max(0, at - SEEK_RUN_UP);
    const output = await runProcessOutput("ffmpeg", [
      "-hide_banner", "-loglevel", "info", "-y", "-copyts", "-start_at_zero",
      ...(jump > 0 ? ["-ss", String(jump)] : []), "-i", source,
      "-vf", `trim=start=${at},showinfo`, "-frames:v", "1", "-fps_mode", "passthrough", ...JPEG, target,
    ]);
    const base = /config in time_base:\s*(\d+)\/(\d+)/u.exec(output.stderr);
    const pts = /\bn:\s*0\s+pts:\s*(-?\d+)/u.exec(output.stderr);
    assert(base !== null && pts !== null, `no video frame exists at or after ${at} s`);
    return Number(pts[1]) * Number(base[1]) / Number(base[2]);
  }
  const temporary = await mkdtemp(join(tmpdir(), "hypit-labeled-frame-"));
  const clean = join(temporary, "clean.jpg");
  try {
    const actual = await cutFrame(source, at, clean);
    const label = rasterLabel(timecode(actual));
    await runProcessWithInput("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", clean, ...rawVideoInput(label, 1),
      "-filter_complex", "[0:v][1:v]overlay=8:8[out]", "-map", "[out]", "-frames:v", "1", ...JPEG, target,
    ], label.bytes);
    return actual;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const TILE_COLUMNS = 3;
const TILE_CELL_WIDTH = 480;
/** A compact overview default. Callers choose denser samples for fast changes. */
export function tileFrameCount(seconds: number): number { return clamp(Math.round(seconds * 1.5), 4, 9); }

export function tileSampleTimes(start: number, end: number, frameCount: number): readonly number[] {
  assert(end > start, `the stretch must end after it starts (${start} to ${end})`);
  assert(Number.isSafeInteger(frameCount) && frameCount >= 2, "a grid needs at least two frames");
  return Array.from({ length: frameCount }, (_, index) => round(start + (index + 0.5) * (end - start) / frameCount));
}

function escapeMarkup(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function frameLabel(at: number, width: number, words?: FrameWords): Promise<Buffer> {
  const lines = [timecode(at)];
  if (words !== undefined) {
    lines.push(words.active.length === 0 ? "No timed word at this frame" : words.active.map((word) =>
      `<b>${escapeMarkup(word.text)}</b>  ${word.start!.toFixed(3)}–${word.end!.toFixed(3)} s`).join("\n"));
    if (words.context.length > 0) lines.push(words.context.map((word) => words.active.includes(word)
      ? `<span foreground="#ffdc80"><b>${escapeMarkup(word.text)}</b></span>` : escapeMarkup(word.text)).join(" "));
  }
  const text = await sharp({ text: {
    text: `<span foreground="#f5f5f5">${lines.join("\n")}</span>`,
    font: `sans ${Math.max(12, Math.round(width / 28))}`, width: width - 16, rgba: true, wrap: "word-char",
  } }).png().toBuffer({ resolveWithObject: true });
  return sharp({ create: { width, height: text.info.height + 16, channels: 3, background: "#0c0c0c" } })
    .composite([{ input: text.data, left: 8, top: 8 }]).png().toBuffer();
}

type SampledFrame = { readonly requestedAt: number; readonly at: number; readonly words?: FrameWords };

export async function tileFrames(
  source: string,
  times: readonly number[],
  target: string,
  cellWidth: number,
  columns: number,
  words?: readonly TranscriptWord[],
): Promise<readonly SampledFrame[]> {
  assert(times.length >= 1, "a grid needs at least one frame");
  const temporary = await mkdtemp(join(tmpdir(), "hypit-tile-"));
  try {
    const frames: SampledFrame[] = [];
    const cells: { picture: Buffer; label: Buffer; height: number; labelHeight: number }[] = [];
    for (let index = 0; index < times.length; index += 1) {
      const at = times[index]!;
      const path = join(temporary, `${index}.jpg`);
      const actual = await cutFrame(source, at, path);
      const frameWords = words === undefined ? undefined : wordsAt(words, actual);
      frames.push({ requestedAt: at, at: actual, ...(frameWords === undefined ? {} : { words: frameWords }) });
      const picture = await sharp(path).resize({ width: cellWidth }).png().toBuffer({ resolveWithObject: true });
      const label = await frameLabel(actual, cellWidth, frameWords);
      const labelHeight = (await sharp(label).metadata()).height!;
      cells.push({ picture: picture.data, height: picture.info.height, label, labelHeight });
    }
    const rows = Math.ceil(times.length / columns);
    const pictureHeight = Math.max(...cells.map((cell) => cell.height));
    const rowHeight = pictureHeight + Math.max(...cells.map((cell) => cell.labelHeight));
    await sharp({ create: {
      width: columns * (cellWidth + 8) + 8, height: rows * (rowHeight + 8) + 8,
      channels: 3, background: "#0c0c0c",
    } }).composite(cells.flatMap((cell, index) => {
      const left = 8 + (index % columns) * (cellWidth + 8);
      const top = 8 + Math.floor(index / columns) * (rowHeight + 8);
      return [{ input: cell.picture, left, top }, { input: cell.label, left, top: top + pictureHeight }];
    })).jpeg({ quality: 90 }).toFile(target);
    return frames;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/**
 * Adjacent-frame visual change candidates. Scores are mechanical evidence, not editorial shots.
 */
const DEFAULT_BOUNDARY_RATE = 12;
const DEFAULT_BOUNDARY_THRESHOLD = 0.1;
export type VisualBoundary = { readonly at: number; readonly score: number };
export async function visualBoundaries(
  source: string,
  sampleRate = DEFAULT_BOUNDARY_RATE,
  threshold = DEFAULT_BOUNDARY_THRESHOLD,
): Promise<readonly VisualBoundary[]> {
  const bytes = await runProcess("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", source, "-vf", `fps=${sampleRate},scale=32:32,format=rgb24`, "-f", "rawvideo", "-",
  ]);
  const stride = 32 * 32 * 3;
  const frames: Uint8Array[] = [];
  for (let index = 0; index + stride <= bytes.byteLength; index += stride) frames.push(bytes.subarray(index, index + stride));
  const candidates: VisualBoundary[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const before = frames[index - 1]!;
    const after = frames[index]!;
    let total = 0;
    for (let byte = 0; byte < after.length; byte += 1) total += Math.abs(after[byte]! - before[byte]!);
    const score = total / after.length / 255;
    if (score >= threshold) candidates.push({ at: round(index / sampleRate), score: round(score) });
  }
  return candidates;
}

// ---------------------------------------------------------------------------------------------------
// Commands

const SAMPLE_OPTIONS = ["--start", "--end", "--at", "--every", "--transcript", "--around", "--occurrence", "--padding"];

async function transcriptOption(parsed: Parsed, cwd: string): Promise<readonly TranscriptWord[] | undefined> {
  const path = parsed.options.get("--transcript");
  return path === undefined ? undefined : readTranscript(resolve(cwd, path));
}

export function intervalSamples(start: number, end: number, every: number): readonly number[] {
  assert(Number.isFinite(start) && start >= 0 && Number.isFinite(end) && end > start, "a sample range needs 0 <= start < end");
  assert(Number.isFinite(every) && every >= 0.001, "--every must be at least 0.001 seconds");
  return Array.from({ length: Math.ceil((end - start) / every) }, (_, index) => round(start + index * every))
    .filter((time) => time < end);
}

function sampleRange(parsed: Parsed, duration: number, words?: readonly TranscriptWord[]): { start: number; end: number } {
  const around = parsed.options.get("--around");
  if (around !== undefined) {
    assert(words !== undefined, "--around requires --transcript");
    assert(!parsed.options.has("--start") && !parsed.options.has("--end"), "choose --around or --start/--end");
    const matches = phraseRanges(words, around);
    assert(matches.length > 0, `No timed phrase matches ${JSON.stringify(around)}`);
    assert(matches.length === 1 || parsed.options.has("--occurrence"),
      `The phrase occurs ${matches.length} times: ${matches.map((match, index) => `${index + 1}: ${match.start}–${match.end}s`).join(", ")}. Choose --occurrence <n> or --start/--end.`);
    const occurrence = integerOption(parsed, "--occurrence", 1, 1);
    const match = matches[occurrence - 1];
    assert(match !== undefined, `--occurrence ${occurrence} is beyond the ${matches.length} matches`);
    const padding = secondsOption(parsed, "--padding", 0.3);
    const start = Math.max(0, round(match.start - padding));
    const end = Math.min(duration, round(match.end + padding));
    assert(end > start, "the phrase lies outside the input media; use its matching transcript");
    return { start, end };
  }
  assert(!parsed.options.has("--occurrence") && !parsed.options.has("--padding"), "--occurrence and --padding apply to --around");
  const start = secondsOption(parsed, "--start", 0);
  const end = secondsOption(parsed, "--end", duration);
  assert(end > start && end <= duration, `range must satisfy 0 <= start < end <= ${duration} s`);
  return { start, end };
}

function sampleTimes(parsed: Parsed, duration: number, words?: readonly TranscriptWord[], requireEvery = false): readonly number[] {
  const at = parsed.options.get("--at");
  if (at !== undefined) {
    for (const key of ["--start", "--end", "--every", "--frames", "--around", "--occurrence", "--padding"]) {
      assert(!parsed.options.has(key), `--at cannot be combined with ${key}`);
    }
    const times = secondsList(at, "--at", 1);
    assert(times.every((time) => time < duration), `a frame time must be before the end of the file (${duration} s)`);
    assert(times.every((time, index) => index === 0 || time > times[index - 1]!), "sample times must be strictly increasing");
    return times;
  }
  const { start, end } = sampleRange(parsed, duration, words);
  const every = parsed.options.get("--every");
  assert(every === undefined || !parsed.options.has("--frames"), "choose --every or --frames");
  assert(!requireEvery || every !== undefined, "frames requires --at <s,s,…> or --every <seconds>");
  const times = every === undefined
    ? tileSampleTimes(start, end, integerOption(parsed, "--frames", tileFrameCount(end - start), 2))
    : intervalSamples(start, end, Number(every));
  assert(times.length > 0 && times.every((time) => time < duration), "the range needs sample times before the media ends");
  assert(times.every((time, index) => index === 0 || time > times[index - 1]!), "sample times must be distinct to the nearest millisecond");
  return times;
}

async function probe(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, []);
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  if (parsed.json) { io.write(`${JSON.stringify({ path: source, ...info }, null, 2)}\n`); return; }
  io.write(`${source}\n  ${info.duration} s  ${info.width}×${info.height}  ${info.frameRate > 0 ? `${info.frameRate} fps` : "still"}  ${info.hasAudio ? "with audio" : "no audio"}\n`);
}

async function cut(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, ["--start", "--end", "--to"], ["--label-time"]);
  const source = await sourceFile(parsed, cwd);
  const start = secondsOption(parsed, "--start", 0);
  const info = await probeMedia(source);
  const end = secondsOption(parsed, "--end", info.duration);
  assert(end <= info.duration + 0.001, `--end ${end} is past the end of the file (${info.duration} s)`);
  const target = await destination(parsed, cwd, "the clip to write, for example notes/hook.mp4");
  const labeled = parsed.flags.has("--label-time");
  await cutClip(source, start, end, target, labeled ? info : undefined);
  if (parsed.json) { io.write(`${JSON.stringify({ path: target, start, end, seconds: round(end - start), labeled }, null, 2)}\n`); return; }
  io.write(`${target}\n  ${start} s to ${end} s (${round(end - start)} s)${labeled ? ", source time visible" : ""}\n`);
}

async function frames(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, [...SAMPLE_OPTIONS, "--to"], ["--label-time"]);
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  const words = await transcriptOption(parsed, cwd);
  const times = sampleTimes(parsed, info.duration, words, true);
  const to = await destinationDirectory(parsed, cwd, "the new directory to write the frames into");
  const staging = await mkdtemp(join(dirname(to), ".hypit-frames-"));
  const labeled = parsed.flags.has("--label-time") || words !== undefined;
  const written: (SampledFrame & { readonly path: string })[] = [];
  try {
    for (const time of times) {
      const name = `frame-${time.toFixed(3).replace(".", "_")}s.jpg`;
      const frame = words === undefined
        ? { requestedAt: time, at: await cutFrame(source, time, join(staging, name), labeled) }
        : (await tileFrames(source, [time], join(staging, name), info.width, 1, words))[0]!;
      written.push({ ...frame, path: join(to, name) });
    }
    await rename(staging, to);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  if (parsed.json) { io.write(`${JSON.stringify({ directory: to, labeled, frames: written }, null, 2)}\n`); return; }
  io.write(`${to}\n  ${written.length} ${labeled ? "time-labeled " : ""}${written.length === 1 ? "frame" : "frames"} from ${written[0]!.at} s to ${written.at(-1)!.at} s\n`);
}

async function tile(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, [...SAMPLE_OPTIONS, "--frames", "--cell", "--columns", "--to"]);
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  const words = await transcriptOption(parsed, cwd);
  const times = sampleTimes(parsed, info.duration, words);
  // Preserve source width unless an exceptionally tiny input needs room for a legible timecode.
  const cell = integerOption(parsed, "--cell", Math.max(80, Math.min(TILE_CELL_WIDTH, info.width)), 80);
  const columns = integerOption(parsed, "--columns", TILE_COLUMNS, 1);
  const target = await destination(parsed, cwd, "the grid image to write, for example notes/hook-grid.jpg");
  const frames = await tileFrames(source, times, target, cell, columns, words);
  const rows = Math.ceil(times.length / columns);
  if (parsed.json) { io.write(`${JSON.stringify({ path: target, samples: times, columns, rows, cellWidth: cell, frames }, null, 2)}\n`); return; }
  io.write(`${target}\n  ${times.length} labeled frames, ${columns}×${rows}, ${cell} px cells\n  ${times.map((at) => `${at} s`).join("  ")}\n`);
}

type TileRange = {
  readonly id?: string;
  readonly start: number;
  readonly end: number;
  readonly frames?: number;
  readonly every?: number;
};

function tileRange(value: unknown, index: number, duration: number): TileRange {
  assert(typeof value === "object" && value !== null && !Array.isArray(value), `range ${index + 1} must be an object`);
  const raw = value as Record<string, unknown>;
  assert(typeof raw.start === "number" && Number.isFinite(raw.start) && raw.start >= 0, `range ${index + 1}.start must be non-negative seconds`);
  assert(typeof raw.end === "number" && Number.isFinite(raw.end) && raw.end > raw.start, `range ${index + 1}.end must be after its start`);
  assert(raw.end <= duration, `range ${index + 1}.end is past the end of the file (${duration} s)`);
  assert(raw.id === undefined || (typeof raw.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(raw.id)), `range ${index + 1}.id must be a safe file name`);
  assert(raw.frames === undefined || (Number.isSafeInteger(raw.frames) && (raw.frames as number) >= 2), `range ${index + 1}.frames must be a whole number of at least 2`);
  assert(raw.every === undefined || (typeof raw.every === "number" && Number.isFinite(raw.every) && raw.every >= 0.001), `range ${index + 1}.every must be at least 0.001 seconds`);
  assert(raw.frames === undefined || raw.every === undefined, `range ${index + 1} must choose frames or every`);
  return { start: raw.start, end: raw.end, ...(raw.id === undefined ? {} : { id: raw.id as string }),
    ...(raw.frames === undefined ? {} : { frames: raw.frames as number }), ...(raw.every === undefined ? {} : { every: raw.every as number }) };
}

async function tiles(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, [...SAMPLE_OPTIONS, "--ranges", "--frames", "--cell", "--columns", "--rows", "--to"]);
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  const words = await transcriptOption(parsed, cwd);
  const rangesPath = parsed.options.get("--ranges");
  let ranges: { id?: string; start: number; end: number; times: readonly number[] }[];
  if (rangesPath === undefined) {
    const times = sampleTimes(parsed, info.duration, words);
    const range = parsed.options.has("--at")
      ? { start: times[0]!, end: times.at(-1)! }
      : sampleRange(parsed, info.duration, words);
    ranges = [{ ...range, times }];
  } else {
    for (const key of ["--start", "--end", "--at", "--around", "--padding", "--occurrence"]) {
      assert(!parsed.options.has(key), `--ranges cannot be combined with ${key}`);
    }
    assert(!parsed.options.has("--frames") || !parsed.options.has("--every"), "choose --frames or --every");
    const raw = JSON.parse(await readFile(resolve(cwd, rangesPath), "utf8")) as unknown;
    assert(Array.isArray(raw) && raw.length > 0, `${rangesPath} must contain a non-empty JSON array`);
    ranges = raw.map((value, index) => {
      const range = tileRange(value, index, info.duration);
      const options = new Map(parsed.options);
      options.set("--start", String(range.start)); options.set("--end", String(range.end));
      if (range.frames !== undefined) { options.delete("--every"); options.set("--frames", String(range.frames)); }
      if (range.every !== undefined) { options.delete("--frames"); options.set("--every", String(range.every)); }
      return { ...range, times: sampleTimes({ ...parsed, options }, info.duration, words) };
    });
    const ids = ranges.flatMap((range) => range.id === undefined ? [] : [range.id]);
    assert(new Set(ids).size === ids.length, "range ids must be unique");
  }
  const cell = integerOption(parsed, "--cell", Math.max(80, Math.min(TILE_CELL_WIDTH, info.width)), 80);
  const columns = integerOption(parsed, "--columns", TILE_COLUMNS, 1);
  const rows = integerOption(parsed, "--rows", 3, 1);
  const perPage = columns * rows;
  const to = await destinationDirectory(parsed, cwd, "the new directory to write the grids into");
  const staging = await mkdtemp(join(dirname(to), ".hypit-tiles-"));
  const written: { id?: string; start: number; end: number; samples: readonly number[]; path: string; frames: readonly SampledFrame[] }[] = [];
  try {
    for (const [index, range] of ranges.entries()) {
      const stem = range.id ?? `${range.start.toFixed(3).replace(".", "_")}s-${range.end.toFixed(3).replace(".", "_")}s`;
      for (let offset = 0; offset < range.times.length; offset += perPage) {
        const times = range.times.slice(offset, offset + perPage);
        const page = range.times.length > perPage ? `-p${String(offset / perPage + 1).padStart(3, "0")}` : "";
        const name = `${String(index + 1).padStart(3, "0")}-${stem}${page}.jpg`;
        const frames = await tileFrames(source, times, join(staging, name), cell, columns, words);
        written.push({ ...(range.id === undefined ? {} : { id: range.id }), start: range.start, end: range.end,
          samples: times, path: join(to, name), frames });
      }
    }
    await rename(staging, to);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  if (parsed.json) { io.write(`${JSON.stringify({ directory: to, columns, rows, cellWidth: cell, grids: written }, null, 2)}\n`); return; }
  io.write(`${to}\n  ${written.length} time-labeled ${written.length === 1 ? "grid" : "grids"}\n`);
}

async function boundaries(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, ["--rate", "--threshold"]);
  const source = await sourceFile(parsed, cwd);
  const rate = numberOption(parsed, "--rate", DEFAULT_BOUNDARY_RATE, 1, 120);
  const threshold = numberOption(parsed, "--threshold", DEFAULT_BOUNDARY_THRESHOLD, 0, 1);
  const candidates = await visualBoundaries(source, rate, threshold);
  if (parsed.json) { io.write(`${JSON.stringify({ path: source, sampleRate: rate, threshold, candidates }, null, 2)}\n`); return; }
  const shown = candidates.slice(0, 40);
  const remaining = candidates.length - shown.length;
  io.write(`${source}\n  ${candidates.length} visual-change ${candidates.length === 1 ? "candidate" : "candidates"} at ${rate} samples/s; scores are not shot labels\n${
    shown.map((candidate) => `  ${candidate.at} s  score ${candidate.score}`).join("\n")}${remaining > 0 ? `\n  … ${remaining} more; --json returns all candidates` : ""}\n`);
}

async function fetch(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, ["--to"]);
  const [url] = parsed.positionals;
  assert(url !== undefined && isVideoUrl(url), "name an http or https link first");
  assert(parsed.positionals.length === 1, "fetch takes exactly one link");
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
    cut: ["  hypit media cut <file> --start <s> --end <s> [--label-time] --to <clip.mp4>",
      "    One exact stretch. --label-time visibly overlays absolute source time on the evidence copy."],
    frames: ["  hypit media frames <file> (--at <s,s,…> | --every <s>) [--start <s> --end <s>] [--label-time] [--transcript <json>] --to <dir>",
      "    Individual frames named by source time; --transcript adds word times and context below each picture."],
    tile: ["  hypit media tile <file> [--start <s> --end <s> | --at <s,s,…>] [--every <s> | --frames <n>] [--transcript <json>] [--cell <px>] [--columns <n>] --to <grid.jpg>",
      "    One grid. --every samples from start, excluding end; --frames chooses evenly spaced midpoints."],
    tiles: ["  hypit media tiles <file> [--start <s> --end <s> | --at <s,s,…> | --ranges <json>] [--every <s> | --frames <n>] [--transcript <json>] [--cell <px>] [--columns <n>] [--rows <n>] --to <dir>",
      "    Paginated grids (3 rows by default). Range files contain { start, end, id?, frames?, every? }."],
    boundaries: ["  hypit media boundaries <file> [--rate <samples/s>] [--threshold <0..1>]",
      "    Mechanical adjacent-frame change candidates with scores; never editorial shot labels."],
    fetch: ["  hypit media fetch <url> --to <video.mp4>", "    A link turned into a file with the pinned yt-dlp, video and audio together."],
  };
  const chosen = topic === undefined ? mediaCommands : [topic];
  io.write(`hypit media\nInspect media at chosen times and scales. Local work; no Runtime Profile, no request, no state.\n\n${
    chosen.map((item) => sections[item].join("\n")).join("\n\n")}\n\nFrames and grids accept --around <phrase> with --transcript instead of --start/--end.\n`
    + "Use --occurrence <n> for a repeated phrase; --padding <s> adds time on each side (default 0.3).\n"
    + "Transcript times must share the input media's clock. An untimed gap is labeled as such, without inferring silence.\n"
    + "Commands that create evidence write only what --to names and refuse to overwrite. Add --json for the complete machine view.\n");
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
  else if (command === "tiles") await tiles(rest, io, cwd);
  else if (command === "boundaries") await boundaries(rest, io, cwd);
  else await fetch(rest, io, cwd);
}
