import { copyFile, link, mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";

import type { CliIo } from "@hypit/hypit/cli";
import sharp from "sharp";

import { decodeMediaFrames } from "./file-frames.js";
import { writeFrameGrid } from "./frame-grid.js";
import { runProcess, runProcessOutput, runProcessWithInput } from "./process.js";
import {
  decodeSpeechTranscriptSource,
  phraseRanges,
  transcriptWordsFromEvidence,
  wordsAt,
} from "@hypit/speech-evidence";
import type { FrameWords, TranscriptWord } from "@hypit/speech-evidence";
import { audioViewDimensions, inspectAudio, selectAudioStream } from "./audio-view.js";
import { ffprobeDisplayExtent } from "./ffprobe-display.js";
import { renderSpectrogramView, writeSpectrogram } from "./spectrogram.js";
import type { FrequencyScale, SpectrogramScale } from "./spectrogram.js";
import { renderWaveformView, writeWaveform } from "./waveform.js";
import type { WaveformFilter, WaveformScale } from "./waveform.js";

/**
 * Local views of media at chosen times and scales. Transcript annotations use the same seconds as
 * the input media. These commands expose evidence; editorial interpretation belongs to the author.
 */

export const mediaCommands = ["probe", "cut", "frames", "grid", "waveform", "spectrogram", "boundaries"] as const;
export type MediaCommand = typeof mediaCommands[number];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readTranscript(path: string): Promise<readonly TranscriptWord[]> {
  return transcriptWordsFromEvidence(decodeSpeechTranscriptSource(await readFile(path, "utf8"), path));
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
  readonly repeated: ReadonlyMap<string, readonly string[]>;
  readonly flags: ReadonlySet<string>;
  readonly json: boolean;
};

function parseArguments(
  argv: readonly string[], allowed: readonly string[], allowedFlags: readonly string[] = [], repeatable: readonly string[] = [],
): Parsed {
  const positionals: string[] = [];
  const options = new Map<string, string>();
  const repeated = new Map<string, string[]>();
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
    if (!repeatable.includes(item) && options.has(item)) throw new Error(`${item} cannot be repeated`);
    const value = argv[index + 1];
    if (value === undefined || (value.startsWith("--") && value.length > 2)) throw new Error(`${item} requires a value`);
    if (repeatable.includes(item)) repeated.set(item, [...(repeated.get(item) ?? []), value]);
    else options.set(item, value);
    index += 1;
  }
  return { positionals, options, repeated, flags, json };
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

type VideoProbe = {
  readonly hasVideo: true;
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
};

export type MediaProbe = {
  readonly duration: number;
  readonly hasAudio: boolean;
} & (VideoProbe | { readonly hasVideo: false });

function requireVideo(info: MediaProbe, path: string): asserts info is MediaProbe & VideoProbe {
  assert(info.hasVideo, `${path}: no video stream`);
}

export async function probeMedia(path: string, options: { readonly ffprobePath?: string } = {}): Promise<MediaProbe> {
  const raw = await runProcess(options.ffprobePath ?? "ffprobe", [
    "-v", "error", "-show_entries",
    "format=duration:stream=codec_type,width,height,r_frame_rate:stream_disposition=attached_pic"
      + ":stream_side_data=side_data_type,rotation:stream_tags=rotate",
    "-of", "json", path,
  ]);
  const parsed = JSON.parse(raw.toString("utf8")) as {
    format?: { duration?: string };
    streams?: readonly {
      codec_type?: string; width?: number; height?: number; r_frame_rate?: string;
      disposition?: { attached_pic?: number };
      side_data_list?: readonly unknown[];
      tags?: { rotate?: string };
    }[];
  };
  const video = parsed.streams?.find((item) => item.codec_type === "video" && item.disposition?.attached_pic !== 1);
  const duration = Number(parsed.format?.duration);
  assert(Number.isFinite(duration) && duration > 0, `${path}: duration is unavailable`);
  const hasAudio = parsed.streams?.some((item) => item.codec_type === "audio") ?? false;
  assert(video !== undefined || hasAudio, `${path}: no audio or video stream`);
  if (video === undefined) return { duration: round(duration), hasVideo: false, hasAudio };
  const extent = ffprobeDisplayExtent(video, `${path}: video stream`);
  // ffprobe reports the rate as a ratio; a still image reports none.
  const ratio = (video.r_frame_rate ?? "").split("/");
  const rate = Number(ratio[0]) / Number(ratio[1] ?? 1);
  return {
    duration: round(duration),
    hasVideo: true,
    width: extent.width,
    height: extent.height,
    frameRate: Number.isFinite(rate) && rate > 0 ? round(rate) : 0,
    hasAudio,
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
function stillImageArgs(target: string): readonly string[] {
  return extname(target).toLowerCase() === ".png"
    ? ["-c:v", "png", "-compression_level", "6"]
    : JPEG;
}

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
  labelInfo?: Pick<VideoProbe, "frameRate">,
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

type CutSpan = { readonly start: number; readonly end: number };

function keptSpan(raw: string, duration: number): CutSpan {
  const parts = raw.split(":");
  assert(parts.length === 2 && parts.every((part) => part.trim().length > 0), `--keep needs start:end in seconds, got ${raw}`);
  const [start, end] = parts.map(Number);
  assert(Number.isFinite(start) && Number.isFinite(end) && start! >= 0 && end! > start! && end! <= duration + 0.001,
    `--keep ${raw} must satisfy 0 <= start < end <= ${duration} s`);
  return { start: start!, end: end! };
}

/** Decode the selected parts once, join them on a new local clock, and preserve only existing streams. */
async function cutProduction(source: string, spans: readonly CutSpan[], target: string, info: MediaProbe): Promise<void> {
  const seek = Math.max(0, spans[0]!.start - SEEK_RUN_UP);
  const labels: string[] = [];
  const filters: string[] = [];
  const videoInputs = spans.map((_, index) => `vsrc${index}`);
  const audioInputs = spans.map((_, index) => `asrc${index}`);
  if (info.hasVideo && spans.length > 1) filters.push(`[0:v:0]split=${spans.length}${videoInputs.map((item) => `[${item}]`).join("")}`);
  if (info.hasAudio && spans.length > 1) filters.push(`[0:a:0]asplit=${spans.length}${audioInputs.map((item) => `[${item}]`).join("")}`);
  for (const [index, span] of spans.entries()) {
    const start = round(span.start - seek);
    const end = round(span.end - seek);
    if (info.hasVideo) filters.push(`[${spans.length === 1 ? "0:v:0" : videoInputs[index]}]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${index}]`);
    if (info.hasAudio) filters.push(`[${spans.length === 1 ? "0:a:0" : audioInputs[index]}]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`);
    labels.push(`${info.hasVideo ? `[v${index}]` : ""}${info.hasAudio ? `[a${index}]` : ""}`);
  }
  if (spans.length > 1) filters.push(`${labels.join("")}concat=n=${spans.length}:v=${info.hasVideo ? 1 : 0}:a=${info.hasAudio ? 1 : 0}${info.hasVideo ? "[v]" : ""}${info.hasAudio ? "[a]" : ""}`);
  const videoLabel = spans.length === 1 ? "[v0]" : "[v]";
  const audioLabel = spans.length === 1 ? "[a0]" : "[a]";
  await runProcess("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    ...(seek > 0 ? ["-ss", String(round(seek))] : []), "-i", source,
    "-filter_complex", filters.join(";"),
    ...(info.hasVideo ? ["-map", videoLabel, "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-fps_mode", "vfr",
      ...([".mp4", ".mov"].includes(extname(target).toLowerCase()) ? ["-movflags", "+faststart"] : [])] : []),
    ...(info.hasAudio ? ["-map", audioLabel, "-c:a", ...(info.hasVideo ? ["aac", "-b:a", "192k"] : ["pcm_s24le"])] : []),
    target,
  ]);
}

/** Publish a completed cut without overwriting a file another process may have created meanwhile. */
async function writeCut(
  source: string, spans: readonly CutSpan[], target: string, info: MediaProbe, labeled: boolean,
): Promise<void> {
  const work = await mkdtemp(join(dirname(target), ".hypit-cut-"));
  const staged = join(work, `cut${extname(target)}`);
  try {
    if (labeled) {
      requireVideo(info, source);
      await cutClip(source, spans[0]!.start, spans[0]!.end, staged, info);
    } else await cutProduction(source, spans, staged, info);
    await link(staged, target);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function cutFrame(source: string, at: number, target: string, labelTime = false): Promise<number> {
  if (!labelTime) {
    const jump = Math.max(0, at - SEEK_RUN_UP);
    const output = await runProcessOutput("ffmpeg", [
      "-hide_banner", "-loglevel", "info", "-y", "-copyts", "-start_at_zero",
      ...(jump > 0 ? ["-ss", String(jump)] : []), "-i", source,
      "-vf", `trim=start=${at},showinfo`, "-frames:v", "1", "-fps_mode", "passthrough", ...stillImageArgs(target), target,
    ]);
    const base = /config in time_base:\s*(\d+)\/(\d+)/u.exec(output.stderr);
    const pts = /\bn:\s*0\s+pts:\s*(-?\d+)/u.exec(output.stderr);
    assert(base !== null && pts !== null, `no video frame exists at or after ${at} s`);
    return Number(pts[1]) * Number(base[1]) / Number(base[2]);
  }
  const temporary = await mkdtemp(join(tmpdir(), "hypit-labeled-frame-"));
  const clean = join(temporary, "clean.png");
  try {
    const actual = await cutFrame(source, at, clean);
    const label = rasterLabel(timecode(actual));
    await runProcessWithInput("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", clean, ...rawVideoInput(label, 1),
      "-filter_complex", "[0:v][1:v]overlay=8:8[out]", "-map", "[out]", "-frames:v", "1", ...stillImageArgs(target), target,
    ], label.bytes);
    return actual;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const GRID_COLUMNS = 3;
const GRID_CELL_WIDTH = 480;
/** A compact overview default. Callers choose denser samples for fast changes. */
export function gridFrameCount(seconds: number): number { return clamp(Math.round(seconds * 1.5), 4, 9); }

export function gridSampleTimes(start: number, end: number, frameCount: number): readonly number[] {
  assert(end > start, `the stretch must end after it starts (${start} to ${end})`);
  assert(Number.isSafeInteger(frameCount) && frameCount >= 2, "a grid needs at least two frames");
  return Array.from({ length: frameCount }, (_, index) => round(start + (index + 0.5) * (end - start) / frameCount));
}

function escapeMarkup(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const COMPACT_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const OPEN_PUNCTUATION = /[(\[{“‘《〈「『【〔〖]/u;
const CLOSE_PUNCTUATION = /[)\]}，。！？；：、,.!?;:%‰”’》〉」』】〕〗]/u;

function transcriptSeparator(before: string, after: string): string {
  const left = Array.from(before).at(-1) ?? "";
  const right = Array.from(after)[0] ?? "";
  return (COMPACT_SCRIPT.test(left) && COMPACT_SCRIPT.test(right))
    || OPEN_PUNCTUATION.test(left) || CLOSE_PUNCTUATION.test(right) ? "" : " ";
}

function transcriptMarkup(words: readonly TranscriptWord[], active: readonly TranscriptWord[]): string {
  let result = "";
  for (const [index, word] of words.entries()) {
    if (index > 0) result += transcriptSeparator(words[index - 1]!.text, word.text);
    const text = escapeMarkup(word.text);
    result += active.includes(word) ? `<span foreground="#ffdc80"><b>${text}</b></span>` : text;
  }
  return result;
}

function automaticWordContext(words: readonly TranscriptWord[], width: number): number {
  const measured = words.filter((word) => word.text.length > 0).slice(0, 40);
  const averageCharacters = measured.length === 0 ? 4
    : measured.reduce((sum, word) => sum + Array.from(word.text).length, 0) / measured.length;
  const fontSize = Math.max(12, Math.round(width / 28));
  const approximateCharacters = Math.max(8, Math.floor(width / fontSize * 0.8));
  const approximateWords = Math.max(1, Math.floor(approximateCharacters / (averageCharacters + 0.5)));
  return clamp(Math.floor((approximateWords - 1) / 2), 1, 10);
}

function frameWordsAt(
  words: readonly TranscriptWord[], at: number, width: number, contextWords?: number,
): FrameWords {
  return wordsAt(words, at, contextWords ?? automaticWordContext(words, width));
}

async function frameAnnotation(
  at: number, width: number, showTime: boolean, words?: FrameWords, ordinal?: number,
): Promise<Buffer | undefined> {
  const heading = [ordinal === undefined ? undefined : `#${ordinal}`, showTime ? timecode(at) : undefined]
    .filter((value): value is string => value !== undefined).join(" · ");
  const lines: string[] = heading.length === 0 ? [] : [heading];
  if (words !== undefined) {
    lines.push(words.active.length === 0 ? "No timed word" : words.active.map((word) =>
      showTime ? `<b>${escapeMarkup(word.text)}</b>  ${word.start!.toFixed(3)}–${word.end!.toFixed(3)} s`
        : `<b>${escapeMarkup(word.text)}</b>`).join("\n"));
    if (words.context.length > 0) lines.push(transcriptMarkup(words.context, words.active));
  }
  if (lines.length === 0) return undefined;
  const text = await sharp({ text: {
    text: `<span foreground="#f5f5f5">${lines.join("\n")}</span>`,
    font: `sans ${Math.max(12, Math.round(width / 28))}`, width: width - 16, rgba: true, wrap: "word-char",
  } }).png().toBuffer({ resolveWithObject: true });
  return sharp({ create: { width, height: text.info.height + 16, channels: 3, background: "#0c0c0c" } })
    .composite([{ input: text.data, left: 8, top: 8 }]).png().toBuffer();
}

async function gridHeader(
  source: string,
  range: { readonly start: number; readonly end: number; readonly id?: string },
  count: number,
  width: number,
): Promise<Buffer> {
  const name = `${escapeMarkup(basename(source))}${range.id === undefined ? "" : ` · ${escapeMarkup(range.id)}`}`;
  const span = range.start === range.end ? timecode(range.start) : `${timecode(range.start)}–${timecode(range.end)}`;
  const text = await sharp({ text: {
    text: `<span foreground="#f5f5f5"><b>${name}</b>\n${span} source time · ${count} ${count === 1 ? "frame" : "frames"}</span>`,
    font: `sans ${Math.max(12, Math.round(width / 64))}`, width: width - 16, rgba: true, wrap: "word-char",
  } }).png().toBuffer({ resolveWithObject: true });
  return sharp({ create: { width, height: text.info.height + 16, channels: 3, background: "#181818" } })
    .composite([{ input: text.data, left: 8, top: 8 }]).png().toBuffer();
}

type SampledFrame = { readonly requestedAt: number; readonly at: number; readonly words?: FrameWords };

type GridWaveform = {
  readonly start: number;
  readonly end: number;
  readonly audioStream: number;
  readonly splitChannels: boolean;
  readonly scale: WaveformScale;
  readonly filter: WaveformFilter;
  readonly height?: number;
  readonly markerColor: string;
};

type GridSpectrogram = {
  readonly start: number;
  readonly end: number;
  readonly audioStream: number;
  readonly splitChannels: boolean;
  readonly scale: SpectrogramScale;
  readonly frequencyScale: FrequencyScale;
  readonly startFrequency?: number;
  readonly stopFrequency?: number;
  readonly dynamicRange: number;
  readonly height?: number;
  readonly markerColor: string;
};

type GridView = {
  readonly showTime: boolean;
  readonly words?: readonly TranscriptWord[];
  readonly wordContext?: number;
  readonly header?: { readonly start: number; readonly end: number; readonly id?: string };
  readonly waveform?: GridWaveform;
  readonly spectrogram?: GridSpectrogram;
};

type ObservedFrame = { readonly requestedAt: number; readonly at: number; readonly path: string };

async function observeFrames(source: string, times: readonly number[], directory: string): Promise<readonly ObservedFrame[]> {
  const frames: ObservedFrame[] = [];
  for (let index = 0; index < times.length; index += 1) {
    const requestedAt = times[index]!;
    const path = join(directory, `${index}.png`);
    frames.push({ requestedAt, at: await cutFrame(source, requestedAt, path), path });
  }
  return frames;
}

export async function gridFrames(
  source: string,
  times: readonly number[],
  target: string,
  cellWidth: number,
  columns: number,
  view: GridView,
): Promise<readonly SampledFrame[]> {
  assert(times.length >= 1, "a grid needs at least one frame");
  const temporary = await mkdtemp(join(tmpdir(), "hypit-grid-"));
  try {
    const observed = await observeFrames(source, times, temporary);
    const frames: SampledFrame[] = [];
    const cells: { path: string; annotation?: Buffer }[] = [];
    for (const [index, frame] of observed.entries()) {
      const frameWords = view.words === undefined ? undefined
        : frameWordsAt(view.words, frame.at, cellWidth, view.wordContext);
      frames.push({ requestedAt: frame.requestedAt, at: frame.at, ...(frameWords === undefined ? {} : { words: frameWords }) });
      const annotation = await frameAnnotation(frame.at, cellWidth, view.showTime, frameWords,
        view.waveform === undefined && view.spectrogram === undefined ? undefined : index + 1);
      cells.push({ path: frame.path, ...(annotation === undefined ? {} : { annotation }) });
    }
    const markers = frames.map((frame, index) => ({ at: frame.at, label: String(index + 1) }));
    const waveform = view.waveform === undefined ? undefined : await renderWaveformView(source, {
      ...view.waveform,
      width: columns * cellWidth + (columns - 1) * 8,
      markers,
      showTime: view.showTime,
    });
    const spectrogram = view.spectrogram === undefined ? undefined : await renderSpectrogramView(source, {
      ...view.spectrogram,
      width: columns * cellWidth + (columns - 1) * 8,
      markers,
      showTime: view.showTime,
    });
    const header = view.header === undefined ? undefined : await gridHeader(
      source, view.header, frames.length, columns * cellWidth + (columns - 1) * 8,
    );
    const tracks = [waveform, spectrogram].filter((track): track is Buffer => track !== undefined);
    await writeFrameGrid(cells, target, cellWidth, columns, {
      ...(header === undefined ? {} : { header }), ...(tracks.length === 0 ? {} : { tracks }),
    });
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
    ? gridSampleTimes(start, end, integerOption(parsed, "--frames", gridFrameCount(end - start), 2))
    : intervalSamples(start, end, Number(every));
  assert(times.length > 0 && times.every((time) => time < duration), "the range needs sample times before the media ends");
  assert(times.every((time, index) => index === 0 || time > times[index - 1]!), "sample times must be distinct to the nearest millisecond");
  return times;
}

async function probe(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, []);
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  const audioStreams = info.hasAudio ? (await inspectAudio(source)).streams : [];
  if (parsed.json) { io.write(`${JSON.stringify({ path: source, ...info, audioStreams }, null, 2)}\n`); return; }
  io.write(`${source}\n  ${info.duration} s  ${info.hasVideo
    ? `${info.width}×${info.height}  ${info.frameRate > 0 ? `${info.frameRate} fps` : "still"}  ${info.hasAudio ? "with audio" : "no audio"}`
    : "audio only"}${audioStreams.length === 0 ? "" : `\n  audio ${audioStreams.length === 1 ? "stream" : "streams"}: ${audioStreams.map((stream) => stream.index).join(", ")}`}\n`);
}

async function cut(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, ["--start", "--end", "--keep", "--to"], ["--label-time"], ["--keep"]);
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  const kept = parsed.repeated.get("--keep") ?? [];
  assert(kept.length === 0 || (!parsed.options.has("--start") && !parsed.options.has("--end")),
    "choose --keep intervals or --start/--end");
  const spans = kept.length > 0 ? kept.map((item) => keptSpan(item, info.duration)) : [{
    start: secondsOption(parsed, "--start", 0), end: secondsOption(parsed, "--end", info.duration),
  }];
  for (const [index, span] of spans.entries()) {
    assert(span.end > span.start && span.end <= info.duration + 0.001,
      `range must satisfy 0 <= start < end <= ${info.duration} s`);
    if (index > 0) assert(span.start >= spans[index - 1]!.end, "--keep intervals must be ordered and non-overlapping");
  }
  const labeled = parsed.flags.has("--label-time");
  assert(!labeled || (info.hasVideo && spans.length === 1), "--label-time needs one video interval");
  const target = await destination(parsed, cwd, "the clip to write, for example notes/hook.mp4");
  if (!info.hasVideo) assert(extname(target).toLowerCase() === ".wav", "--to must end in .wav for audio-only media");
  await writeCut(source, spans, target, info, labeled);
  const output = await probeMedia(target);
  const requestedSeconds = round(spans.reduce((total, span) => total + span.end - span.start, 0));
  if (parsed.json) {
    let outputAt = 0;
    const mapping = spans.map((span) => {
      const item = { sourceStart: span.start, sourceEnd: span.end,
        nominalOutputStart: round(outputAt), nominalOutputEnd: round(outputAt + span.end - span.start) };
      outputAt += span.end - span.start;
      return item;
    });
    io.write(`${JSON.stringify({ path: target, ...(spans.length === 1 ? { start: spans[0]!.start, end: spans[0]!.end } : {}),
      spans, mapping, seconds: requestedSeconds, actualSeconds: output.duration, hasVideo: output.hasVideo, hasAudio: output.hasAudio, labeled }, null, 2)}\n`);
    return;
  }
  io.write(`${target}\n  ${spans.map((span) => `${span.start}–${span.end} s`).join(" + ")} (${output.duration} s output)${labeled ? ", source time visible" : ""}\n`);
}

async function frames(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, [...SAMPLE_OPTIONS, "--to"], ["--label-time", "--every-frame"]);
  if (parsed.flags.has("--every-frame")) { await nativeFrames(parsed, io, cwd, false); return; }
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  requireVideo(info, source);
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
        : (await gridFrames(source, [time], join(staging, name), info.width, 1, { showTime: true, words }))[0]!;
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

type GridRange = {
  readonly id?: string;
  readonly start: number;
  readonly end: number;
  readonly frames?: number;
  readonly every?: number;
};

function gridRange(value: unknown, index: number, duration: number): GridRange {
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

function waveformScaleOption(parsed: Parsed, option: string): WaveformScale {
  const value = parsed.options.get(option) ?? "linear";
  assert(value === "linear" || value === "sqrt" || value === "cbrt" || value === "log",
    `${option} must be linear, sqrt, cbrt or log, got ${value}`);
  return value;
}

function waveformFilterOption(parsed: Parsed, option: string): WaveformFilter {
  const value = parsed.options.get(option) ?? "peak";
  assert(value === "peak" || value === "average", `${option} must be peak or average, got ${value}`);
  return value;
}

function spectrogramScaleOption(parsed: Parsed, option: string): SpectrogramScale {
  const value = parsed.options.get(option) ?? "log";
  assert(value === "linear" || value === "sqrt" || value === "cbrt" || value === "log",
    `${option} must be linear, sqrt, cbrt or log, got ${value}`);
  return value;
}

function frequencyScaleOption(parsed: Parsed, option: string): FrequencyScale {
  const value = parsed.options.get(option) ?? "log";
  assert(value === "linear" || value === "log", `${option} must be linear or log, got ${value}`);
  return value;
}

function optionalIntegerOption(parsed: Parsed, option: string, low: number, high?: number): number | undefined {
  const raw = parsed.options.get(option);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  assert(Number.isSafeInteger(value) && value >= low && (high === undefined || value <= high),
    `${option} must be a whole number from ${low}${high === undefined ? "" : ` to ${high}`}, got ${raw}`);
  return value;
}

function optionalNumberOption(parsed: Parsed, option: string, low: number, high?: number): number | undefined {
  const raw = parsed.options.get(option);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  assert(Number.isFinite(value) && value >= low && (high === undefined || value <= high),
    `${option} must be from ${low}${high === undefined ? "" : ` to ${high}`}, got ${raw}`);
  return value;
}

function selectedAudioStreamOption(parsed: Parsed): number | undefined {
  const raw = parsed.options.get("--audio-stream");
  if (raw === undefined) return undefined;
  const value = Number(raw);
  assert(Number.isSafeInteger(value) && value >= 0, `--audio-stream must be a non-negative stream index, got ${raw}`);
  return value;
}

type GridAudioViews = {
  readonly waveform?: Omit<GridWaveform, "start" | "end">;
  readonly spectrogram?: Omit<GridSpectrogram, "start" | "end">;
};

async function gridAudioViews(parsed: Parsed, source: string): Promise<GridAudioViews> {
  const waveformRequested = parsed.flags.has("--waveform");
  const spectrogramRequested = parsed.flags.has("--spectrogram");
  const anyRequested = waveformRequested || spectrogramRequested;
  const shared = parsed.options.has("--audio-stream") || parsed.options.has("--frame-marker-color")
    || parsed.flags.has("--split-channels");
  assert(anyRequested || !shared,
    "--audio-stream, --frame-marker-color and --split-channels require --waveform or --spectrogram");
  const waveformRelated = parsed.options.has("--waveform-scale") || parsed.options.has("--waveform-filter")
    || parsed.options.has("--waveform-height");
  assert(waveformRequested || !waveformRelated,
    "--waveform-scale, --waveform-filter and --waveform-height require --waveform");
  const spectrogramRelated = ["--spectrogram-scale", "--spectrogram-height", "--frequency-scale", "--start-frequency",
    "--stop-frequency", "--dynamic-range"].some((option) => parsed.options.has(option));
  assert(spectrogramRequested || !spectrogramRelated,
    "spectrogram scale, height, frequency and dynamic-range options require --spectrogram");
  if (!anyRequested) return {};
  assert(!parsed.options.has("--at"), "audio tracks need a source interval; use --start/--end instead of --at");
  const inspection = await inspectAudio(source);
  const stream = selectAudioStream(source, inspection.streams, selectedAudioStreamOption(parsed));
  const sharedView = { audioStream: stream.index, splitChannels: parsed.flags.has("--split-channels"),
    markerColor: parsed.options.get("--frame-marker-color") ?? "#ffdc80" };
  const waveformHeight = optionalIntegerOption(parsed, "--waveform-height", 24, 4_096);
  const spectrogramHeight = optionalIntegerOption(parsed, "--spectrogram-height", 24, 4_096);
  const startFrequency = optionalNumberOption(parsed, "--start-frequency", 0);
  const stopFrequency = optionalNumberOption(parsed, "--stop-frequency", 0.001);
  return {
    ...(waveformRequested ? { waveform: {
      ...sharedView,
      scale: waveformScaleOption(parsed, "--waveform-scale"),
      filter: waveformFilterOption(parsed, "--waveform-filter"),
      ...(waveformHeight === undefined ? {} : { height: waveformHeight }),
    } } : {}),
    ...(spectrogramRequested ? { spectrogram: {
      ...sharedView,
      scale: spectrogramScaleOption(parsed, "--spectrogram-scale"),
      frequencyScale: frequencyScaleOption(parsed, "--frequency-scale"),
      dynamicRange: optionalNumberOption(parsed, "--dynamic-range", 10, 200) ?? 100,
      ...(spectrogramHeight === undefined ? {} : { height: spectrogramHeight }),
      ...(startFrequency === undefined ? {} : { startFrequency }),
      ...(stopFrequency === undefined ? {} : { stopFrequency }),
    } } : {}),
  };
}

function gridViewDescription(
  parsed: Parsed,
  words: readonly TranscriptWord[] | undefined,
  audio: GridAudioViews,
) {
  const wordContext = optionalIntegerOption(parsed, "--word-context", 0);
  return {
    timeLabels: !parsed.flags.has("--no-time"),
    wordLabels: words !== undefined,
    ...(words === undefined ? {} : { wordContext: wordContext ?? "auto" }),
    header: parsed.flags.has("--header"),
    ...(audio.waveform === undefined ? {} : { waveform: {
      audioStream: audio.waveform.audioStream, splitChannels: audio.waveform.splitChannels,
      scale: audio.waveform.scale, filter: audio.waveform.filter,
      ...(audio.waveform.height === undefined ? {} : { height: audio.waveform.height }),
      markerColor: audio.waveform.markerColor,
    } }),
    ...(audio.spectrogram === undefined ? {} : { spectrogram: {
      audioStream: audio.spectrogram.audioStream, splitChannels: audio.spectrogram.splitChannels,
      scale: audio.spectrogram.scale, frequencyScale: audio.spectrogram.frequencyScale,
      dynamicRange: audio.spectrogram.dynamicRange,
      ...(audio.spectrogram.height === undefined ? {} : { height: audio.spectrogram.height }),
      ...(audio.spectrogram.startFrequency === undefined ? {} : { startFrequency: audio.spectrogram.startFrequency }),
      ...(audio.spectrogram.stopFrequency === undefined ? {} : { stopFrequency: audio.spectrogram.stopFrequency }),
      markerColor: audio.spectrogram.markerColor,
    } }),
  };
}

function gridView(
  parsed: Parsed,
  range: { readonly start: number; readonly end: number; readonly id?: string },
  words: readonly TranscriptWord[] | undefined,
  audio: GridAudioViews,
): GridView {
  const wordContext = optionalIntegerOption(parsed, "--word-context", 0);
  return {
    showTime: !parsed.flags.has("--no-time"),
    ...(words === undefined ? {} : { words, ...(wordContext === undefined ? {} : { wordContext }) }),
    ...(parsed.flags.has("--header") ? { header: range } : {}),
    ...(audio.waveform === undefined ? {} : { waveform: { ...audio.waveform, start: range.start, end: range.end } }),
    ...(audio.spectrogram === undefined ? {} : { spectrogram: { ...audio.spectrogram, start: range.start, end: range.end } }),
  };
}

function pageRange(
  range: Pick<GridRange, "start" | "end">,
  times: readonly number[],
  offset: number,
  count: number,
): { start: number; end: number } {
  const first = offset;
  const after = offset + count;
  const start = first === 0 ? range.start : round((times[first - 1]! + times[first]!) / 2);
  const end = after === times.length ? range.end : round((times[after - 1]! + times[after]!) / 2);
  return { start, end };
}

async function grid(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv,
    [...SAMPLE_OPTIONS, "--ranges", "--frames", "--cell", "--columns", "--rows", "--audio-stream", "--waveform-scale",
      "--waveform-filter", "--waveform-height", "--spectrogram-scale", "--spectrogram-height", "--frequency-scale",
      "--start-frequency", "--stop-frequency", "--dynamic-range", "--frame-marker-color", "--word-context", "--format", "--to"],
    ["--every-frame", "--pages", "--waveform", "--spectrogram", "--split-channels", "--no-time", "--header"]);
  const pages = parsed.flags.has("--pages");
  if (!pages) {
    assert(!parsed.flags.has("--every-frame"), "--every-frame requires --pages");
    assert(!parsed.options.has("--ranges"), "--ranges requires --pages");
    assert(!parsed.options.has("--rows"), "--rows applies to --pages");
    assert(!parsed.options.has("--format"), "--format applies to --pages; a single grid uses the --to extension");
  }
  if (parsed.flags.has("--every-frame")) { await nativeFrames(parsed, io, cwd, true); return; }
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  requireVideo(info, source);
  const words = await transcriptOption(parsed, cwd);
  assert(words !== undefined || !parsed.options.has("--word-context"), "--word-context requires --transcript");
  const audio = await gridAudioViews(parsed, source);
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
      const range = gridRange(value, index, info.duration);
      const options = new Map(parsed.options);
      options.set("--start", String(range.start)); options.set("--end", String(range.end));
      if (range.frames !== undefined) { options.delete("--every"); options.set("--frames", String(range.frames)); }
      if (range.every !== undefined) { options.delete("--frames"); options.set("--every", String(range.every)); }
      return { ...range, times: sampleTimes({ ...parsed, options }, info.duration, words) };
    });
    const ids = ranges.flatMap((range) => range.id === undefined ? [] : [range.id]);
    assert(new Set(ids).size === ids.length, "range ids must be unique");
  }
  const cell = integerOption(parsed, "--cell", Math.max(80, Math.min(GRID_CELL_WIDTH, info.width)), 80);
  const requestedColumns = integerOption(parsed, "--columns", GRID_COLUMNS, 1);
  const columns = pages ? requestedColumns : Math.min(requestedColumns, ranges[0]!.times.length);
  if (!pages) {
    const range = ranges[0]!;
    const target = await destination(parsed, cwd, "the grid image to write, for example notes/hook-grid.jpg");
    const frames = await gridFrames(source, range.times, target, cell, columns, gridView(parsed, range, words, audio));
    const rows = Math.ceil(range.times.length / columns);
    if (parsed.json) {
      io.write(`${JSON.stringify({ source, path: target, start: range.start, end: range.end, samples: range.times, columns, rows,
        cellWidth: cell, view: gridViewDescription(parsed, words, audio), frames }, null, 2)}\n`);
      return;
    }
    const labels = [parsed.flags.has("--no-time") ? undefined : "time", words === undefined ? undefined : "word",
      audio.waveform === undefined && audio.spectrogram === undefined ? undefined : "frame-number"].filter(Boolean).join("+");
    io.write(`${target}\n  ${range.times.length} frames, ${columns}×${rows}, ${cell} px cells${labels.length === 0 ? ", no labels" : `, ${labels} labels`}${
      parsed.flags.has("--header") ? ", header" : ""}${audio.waveform === undefined ? "" : ", waveform attached"}${
      audio.spectrogram === undefined ? "" : ", spectrogram attached"}\n  ${range.times.map((at) => `${at} s`).join("  ")}\n`);
    return;
  }
  const rows = integerOption(parsed, "--rows", 3, 1);
  const perPage = columns * rows;
  const to = await destinationDirectory(parsed, cwd, "the new directory to write the grids into");
  const format = parsed.options.get("--format") ?? "jpg";
  assert(format === "jpg" || format === "png", `--format must be jpg or png, got ${format}`);
  const staging = await mkdtemp(join(dirname(to), ".hypit-grids-"));
  const written: { id?: string; start: number; end: number; samples: readonly number[]; path: string; frames: readonly SampledFrame[] }[] = [];
  try {
    for (const [index, range] of ranges.entries()) {
      const stem = range.id ?? `${range.start.toFixed(3).replace(".", "_")}s-${range.end.toFixed(3).replace(".", "_")}s`;
      for (let offset = 0; offset < range.times.length; offset += perPage) {
        const times = range.times.slice(offset, offset + perPage);
        const page = range.times.length > perPage ? `-p${String(offset / perPage + 1).padStart(3, "0")}` : "";
        const name = `${String(index + 1).padStart(3, "0")}-${stem}${page}.${format}`;
        const covered = pageRange(range, range.times, offset, times.length);
        const pageView = { ...covered, ...(range.id === undefined ? {} : { id: range.id }) };
        const frames = await gridFrames(source, times, join(staging, name), cell, columns, gridView(parsed, pageView, words, audio));
        written.push({ ...(range.id === undefined ? {} : { id: range.id }), start: covered.start, end: covered.end,
          samples: times, path: join(to, name), frames });
      }
    }
    await rename(staging, to);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  if (parsed.json) { io.write(`${JSON.stringify({ source, directory: to, columns, rows, cellWidth: cell,
    format, view: gridViewDescription(parsed, words, audio), grids: written }, null, 2)}\n`); return; }
  io.write(`${to}\n  ${written.length} ${written.length === 1 ? "grid" : "grids"}${
    parsed.flags.has("--no-time") && words === undefined && audio.waveform === undefined && audio.spectrogram === undefined
      ? " without labels" : " with labels"}${
    audio.waveform === undefined ? "" : " and waveforms"}${audio.spectrogram === undefined ? "" : " and spectrograms"}\n`);
}

/** Native-frame observation: each requested interval is decoded once, then paginated. */
async function nativeFrames(parsed: Parsed, io: CliIo, cwd: string, grid: boolean): Promise<void> {
  for (const key of ["--at", "--every", "--frames"]) assert(!parsed.options.has(key), `--every-frame cannot be combined with ${key}`);
  const source = await sourceFile(parsed, cwd);
  const info = await probeMedia(source);
  requireVideo(info, source);
  const words = await transcriptOption(parsed, cwd);
  assert(words !== undefined || !parsed.options.has("--word-context"), "--word-context requires --transcript");
  const audio = grid ? await gridAudioViews(parsed, source) : {};
  let ranges: GridRange[];
  const rangeFile = parsed.options.get("--ranges");
  if (rangeFile === undefined) ranges = [sampleRange(parsed, info.duration, words)];
  else {
    for (const key of ["--start", "--end", "--around", "--padding", "--occurrence"]) assert(!parsed.options.has(key), `--ranges cannot be combined with ${key}`);
    const raw = JSON.parse(await readFile(resolve(cwd, rangeFile), "utf8"));
    assert(Array.isArray(raw) && raw.length > 0, "--ranges needs a non-empty JSON array");
    ranges = raw.map((value, index) => gridRange(value, index, info.duration));
    assert(ranges.every(range => range.frames === undefined && range.every === undefined), "Native ranges cannot specify frames or every");
  }
  const cell = integerOption(parsed, "--cell", Math.max(80, Math.min(GRID_CELL_WIDTH, info.width)), 80);
  const columns = integerOption(parsed, "--columns", GRID_COLUMNS, 1);
  const rows = integerOption(parsed, "--rows", 3, 1);
  const format = parsed.options.get("--format") ?? "jpg";
  if (grid) assert(format === "jpg" || format === "png", `--format must be jpg or png, got ${format}`);
  const to = await destinationDirectory(parsed, cwd, "the new directory for native frame evidence");
  const staging = await mkdtemp(join(dirname(to), ".hypit-native-"));
  const written: { at: number; path: string }[] = [];
  const grids: { path: string; start: number; end: number; frames: readonly { at: number; words?: FrameWords }[] }[] = [];
  try {
    for (const [rangeIndex, range] of ranges.entries()) {
      const decodedDirectory = join(staging, "decoded");
      const decoded = await decodeMediaFrames(source, range.start, range.end, decodedDirectory);
      if (grid) {
        const perPage = columns * rows;
        const times = decoded.map((frame) => frame.at);
        for (let offset = 0; offset < decoded.length; offset += perPage) {
          const page = decoded.slice(offset, offset + perPage);
          const cells: { path: string; annotation?: Buffer }[] = [];
          const observed: { at: number; words?: FrameWords }[] = [];
          for (const [pageIndex, frame] of page.entries()) {
            const frameWords = words === undefined ? undefined : frameWordsAt(words, frame.at, cell,
              optionalIntegerOption(parsed, "--word-context", 0));
            const ordinal = audio.waveform === undefined && audio.spectrogram === undefined ? undefined : pageIndex + 1;
            const annotation = await frameAnnotation(frame.at, cell, !parsed.flags.has("--no-time"), frameWords, ordinal);
            cells.push({ path: frame.path, ...(annotation === undefined ? {} : { annotation }) });
            observed.push({ at: frame.at, ...(frameWords === undefined ? {} : { words: frameWords }) });
          }
          const name = `${String(rangeIndex + 1).padStart(3, "0")}-${range.id ?? "frames"}-p${String(offset / perPage + 1).padStart(3, "0")}.${format}`;
          const covered = pageRange(range, times, offset, page.length);
          const markers = page.map((frame, index) => ({ at: frame.at, label: String(index + 1) }));
          const waveform = audio.waveform === undefined ? undefined : await renderWaveformView(source, {
            ...audio.waveform, ...covered, width: columns * cell + (columns - 1) * 8, markers,
            showTime: !parsed.flags.has("--no-time"),
          });
          const spectrogram = audio.spectrogram === undefined ? undefined : await renderSpectrogramView(source, {
            ...audio.spectrogram, ...covered, width: columns * cell + (columns - 1) * 8, markers,
            showTime: !parsed.flags.has("--no-time"),
          });
          const header = parsed.flags.has("--header") ? await gridHeader(source, {
            ...covered, ...(range.id === undefined ? {} : { id: range.id }),
          }, page.length, columns * cell + (columns - 1) * 8) : undefined;
          const tracks = [waveform, spectrogram].filter((track): track is Buffer => track !== undefined);
          await writeFrameGrid(cells, join(staging, name), cell, columns, {
            ...(header === undefined ? {} : { header }), ...(tracks.length === 0 ? {} : { tracks }),
          });
          grids.push({ path: join(to, name), ...covered, frames: observed });
        }
      } else for (const [index, frame] of decoded.entries()) {
        const name = `frame-${String(index).padStart(9, "0")}.jpg`;
        const target = join(staging, name);
        if (parsed.flags.has("--label-time") || words !== undefined) {
          const annotation = await frameAnnotation(frame.at, info.width, true,
            words === undefined ? undefined : frameWordsAt(words, frame.at, info.width));
          await writeFrameGrid([{ path: frame.path, ...(annotation === undefined ? {} : { annotation }) }], target, info.width, 1);
        } else await copyFile(frame.path, target);
        written.push({ at: frame.at, path: join(to, name) });
      }
      await rm(decodedDirectory, { recursive: true, force: true });
    }
    await rename(staging, to);
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
  if (parsed.json) io.write(`${JSON.stringify({ source, directory: to, ...(grid
    ? { columns, rows, cellWidth: cell, format, view: gridViewDescription(parsed, words, audio), grids }
    : { frames: written }) }, null, 2)}\n`);
  else io.write(`${to}\n  ${grid ? `${grids.length} grids` : `${written.length} frames`} from continuous source decoding\n`);
}

async function boundaries(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv, ["--rate", "--threshold"]);
  const source = await sourceFile(parsed, cwd);
  requireVideo(await probeMedia(source), source);
  const rate = numberOption(parsed, "--rate", DEFAULT_BOUNDARY_RATE, 1, 120);
  const threshold = numberOption(parsed, "--threshold", DEFAULT_BOUNDARY_THRESHOLD, 0, 1);
  const candidates = await visualBoundaries(source, rate, threshold);
  if (parsed.json) { io.write(`${JSON.stringify({ path: source, sampleRate: rate, threshold, candidates }, null, 2)}\n`); return; }
  const shown = candidates.slice(0, 40);
  const remaining = candidates.length - shown.length;
  io.write(`${source}\n  ${candidates.length} visual-change ${candidates.length === 1 ? "candidate" : "candidates"} at ${rate} samples/s; scores are not shot labels\n${
    shown.map((candidate) => `  ${candidate.at} s  score ${candidate.score}`).join("\n")}${remaining > 0 ? `\n  … ${remaining} more; --json returns all candidates` : ""}\n`);
}

async function audioObservationSelection(parsed: Parsed, cwd: string) {
  const source = await sourceFile(parsed, cwd);
  const inspection = await inspectAudio(source);
  const stream = selectAudioStream(source, inspection.streams, selectedAudioStreamOption(parsed));
  const words = await transcriptOption(parsed, cwd);
  const { start, end } = sampleRange(parsed, inspection.duration, words);
  assert(!parsed.options.has("--pixels-per-second") || !parsed.options.has("--width"),
    "choose --width or --pixels-per-second");
  const pixelsPerSecond = optionalNumberOption(parsed, "--pixels-per-second", 0.001);
  const width = pixelsPerSecond === undefined
    ? integerOption(parsed, "--width", 2048, 64)
    : Math.round((end - start) * pixelsPerSecond);
  assert(width <= 16_384, "--width must be at most 16384");
  assert(width >= 64, "the selected interval and --pixels-per-second must produce a width of at least 64 pixels");
  return { source, inspection, stream, start, end, width, pixelsPerSecond: width / (end - start) };
}

async function waveform(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv,
    ["--start", "--end", "--audio-stream", "--width", "--pixels-per-second", "--height", "--scale", "--filter",
      "--transcript", "--around", "--occurrence", "--padding", "--to"],
    ["--split-channels", "--no-time"]);
  const { source, stream, start, end, width, pixelsPerSecond } = await audioObservationSelection(parsed, cwd);
  const requestedHeight = optionalIntegerOption(parsed, "--height", 24, 4_096);
  const dimensions = audioViewDimensions({ width, ...(requestedHeight === undefined ? {} : { height: requestedHeight }),
    splitChannels: parsed.flags.has("--split-channels") },
    stream, { width: 2048, height: 96, splitChannelHeight: 48 });
  const scale = waveformScaleOption(parsed, "--scale");
  const filter = waveformFilterOption(parsed, "--filter");
  const target = await destination(parsed, cwd, "the waveform PNG to write, for example notes/audio-waveform.png");
  await writeWaveform(source, target, {
    start, end, audioStream: stream.index, width: dimensions.width, height: dimensions.height, scale, filter,
    splitChannels: parsed.flags.has("--split-channels"), showTime: !parsed.flags.has("--no-time"),
  });
  const result = { path: target, start, end, audioStream: stream.index, width: dimensions.width, height: dimensions.height,
    pixelsPerSecond, splitChannels: parsed.flags.has("--split-channels"), scale, filter,
    timeAxis: !parsed.flags.has("--no-time") };
  if (parsed.json) { io.write(`${JSON.stringify(result, null, 2)}\n`); return; }
  io.write(`${target}\n  audio stream ${stream.index}, ${start}–${end} s, ${dimensions.width}×${dimensions.height} px, ${filter} ${scale}${
    result.splitChannels ? ", channels split" : ""}\n`);
}

async function spectrogram(argv: readonly string[], io: CliIo, cwd: string): Promise<void> {
  const parsed = parseArguments(argv,
    ["--start", "--end", "--audio-stream", "--width", "--pixels-per-second", "--height", "--scale",
      "--frequency-scale", "--start-frequency", "--stop-frequency", "--dynamic-range",
      "--transcript", "--around", "--occurrence", "--padding", "--to"],
    ["--split-channels", "--no-time"]);
  const { source, stream, start, end, width, pixelsPerSecond } = await audioObservationSelection(parsed, cwd);
  const requestedHeight = optionalIntegerOption(parsed, "--height", 24, 4_096);
  const dimensions = audioViewDimensions({ width, ...(requestedHeight === undefined ? {} : { height: requestedHeight }),
    splitChannels: parsed.flags.has("--split-channels") },
    stream, { width: 2048, height: 256, splitChannelHeight: 128 });
  const scale = spectrogramScaleOption(parsed, "--scale");
  const frequencyScale = frequencyScaleOption(parsed, "--frequency-scale");
  const startFrequency = optionalNumberOption(parsed, "--start-frequency", 0);
  const stopFrequency = optionalNumberOption(parsed, "--stop-frequency", 0.001);
  const dynamicRange = optionalNumberOption(parsed, "--dynamic-range", 10, 200) ?? 100;
  const target = await destination(parsed, cwd, "the spectrogram PNG to write, for example notes/audio-spectrogram.png");
  await writeSpectrogram(source, target, {
    start, end, audioStream: stream.index, width: dimensions.width, height: dimensions.height,
    scale, frequencyScale, dynamicRange,
    ...(startFrequency === undefined ? {} : { startFrequency }),
    ...(stopFrequency === undefined ? {} : { stopFrequency }),
    splitChannels: parsed.flags.has("--split-channels"), showTime: !parsed.flags.has("--no-time"),
  });
  const result = { path: target, start, end, audioStream: stream.index, width: dimensions.width, height: dimensions.height,
    pixelsPerSecond, splitChannels: parsed.flags.has("--split-channels"), scale, frequencyScale, dynamicRange,
    ...(startFrequency === undefined ? {} : { startFrequency }), ...(stopFrequency === undefined ? {} : { stopFrequency }),
    timeAxis: !parsed.flags.has("--no-time") };
  if (parsed.json) { io.write(`${JSON.stringify(result, null, 2)}\n`); return; }
  io.write(`${target}\n  audio stream ${stream.index}, ${start}–${end} s, ${dimensions.width}×${dimensions.height} px, ${frequencyScale} frequency scale${
    result.splitChannels ? ", channels split" : ""}\n`);
}

// ---------------------------------------------------------------------------------------------------
// Entry

export function writeMediaHelp(io: CliIo, topic?: MediaCommand): void {
  const sections: Record<MediaCommand, readonly string[]> = {
    probe: ["  hypit media probe <file>", "    Duration and available streams; video adds size and frame rate, and audio reports actual stream indexes."],
    cut: ["  hypit media cut <file> [--start <s> --end <s> | --keep <start:end> ...] [--label-time] --to <clip.mp4|clip.wav>",
      "    Keep one stretch or join ordered stretches from one source. Audio-only outputs WAV; MP4 is a useful video target.",
      "    --label-time overlays source time on a single video evidence copy."],
    frames: ["  hypit media frames <file> (--at <s,s,…> | --every <s> | --every-frame) [--start <s> --end <s>] [--label-time] [--transcript <transcript.svml>] --to <dir>",
      "    Individual frames named by source time; --transcript adds word times and context below each picture."],
    grid: ["  hypit media grid <video> [--start <s> --end <s> | --at <s,s,…>] [--every <s> | --frames <n>] [--transcript <transcript.svml>] [--no-time] [--header] [--waveform] [--spectrogram] [--cell <px>] [--columns <n>] --to <grid.jpg|grid.png>",
      "  hypit media grid <video> --pages [--ranges <json> | --start <s> --end <s>] [--every <s> | --frames <n> | --every-frame] [--format jpg|png] [--rows <n>] --to <dir>",
      "    Time labels are shown by default. --no-time removes cell times and attached audio time axes; without transcript or audio tracks this produces picture-only cells.",
      "    --transcript adds width-adaptive word context using actual frame times; --word-context <n> overrides its radius. --header is independent.",
      "    --waveform adds amplitude over time; --waveform-filter, --waveform-scale and --waveform-height refine that observation.",
      "    --spectrogram adds frequency over time; its scale, frequency range, dynamic range and height can be selected independently.",
      "    --audio-stream and --split-channels apply to attached audio observations. Numbered markers connect each sampled frame to its audio time.",
      "    Audio observations require audio and a source interval, so they cannot be combined with point-only --at selection."],
    waveform: ["  hypit media waveform <audio-or-video> [--start <s> --end <s> | --around <phrase> --transcript <transcript.svml>] [--audio-stream <index>] [--width <px> | --pixels-per-second <n>] [--height <px>] [--filter peak|average] [--scale linear|sqrt|cbrt|log] [--split-channels] [--no-time] --to <waveform.png>",
      "    Amplitude over source time. Peak preserves transients; average exposes sustained sample energy."],
    spectrogram: ["  hypit media spectrogram <audio-or-video> [--start <s> --end <s> | --around <phrase> --transcript <transcript.svml>] [--audio-stream <index>] [--width <px> | --pixels-per-second <n>] [--height <px>] [--scale linear|sqrt|cbrt|log] [--frequency-scale linear|log] [--start-frequency <Hz>] [--stop-frequency <Hz>] [--dynamic-range <dB>] [--split-channels] [--no-time] --to <spectrogram.png>",
      "    Frequency over source time. Videos are accepted when they contain audio; silent videos are not."],
    boundaries: ["  hypit media boundaries <file> [--rate <samples/s>] [--threshold <0..1>]",
      "    Mechanical adjacent-frame change candidates with scores; never editorial shot labels."],
  };
  const chosen = topic === undefined ? mediaCommands : [topic];
  io.write(`hypit media\nInspect and prepare media locally. No Runtime Profile, network request or project state.\n\n${
    chosen.map((item) => sections[item].join("\n")).join("\n\n")}\n\nFrames, grids, waveforms and spectrograms accept --around <phrase> with --transcript instead of --start/--end.\n`
    + "Use --occurrence <n> for a repeated phrase; --padding <s> adds time on each side (default 0.3).\n"
    + "Transcript times must share the input media's clock. An untimed gap is labeled as such, without inferring silence.\n"
    + "Commands write only what --to names and refuse to overwrite. Add --json for the complete machine view.\n");
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
  else if (command === "grid") await grid(rest, io, cwd);
  else if (command === "waveform") await waveform(rest, io, cwd);
  else if (command === "spectrogram") await spectrogram(rest, io, cwd);
  else await boundaries(rest, io, cwd);
}
