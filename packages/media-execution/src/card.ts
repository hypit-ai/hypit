import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import type { MediaStream } from "@hypit/media";
import type { CanonicalValue } from "@hypit/protocol";
import { verifyStandInCardRequest } from "@hypit/stand-in";
import type { StandInCardRequest } from "@hypit/stand-in";

/**
 * A generic stand-in card, drawn from only the media shape a Run supplies.
 *
 * The card is pixels, not a model call: a flat ground coloured by kind, a thick border, a diagonal
 * STAND-IN watermark, the kind in large type, the frame and duration, and for video a running
 * timecode and progress bar. Everything is drawn here with a
 * built-in 5x7 bitmap font so the same card comes out of every machine, with or without a font
 * library in its ffmpeg. The PNG is deterministic for a given request.
 */

type Rgb = readonly [number, number, number];

const GROUND: Record<StandInCardRequest["kind"], Rgb> = {
  video: [0x1E, 0x3A, 0x5F],
  image: [0x2E, 0x4A, 0x3A],
};
const ACCENT: Rgb = [0xF5, 0xC5, 0x42];
const TEXT: Rgb = [0xFF, 0xFF, 0xFF];
const MUTED: Rgb = [0xC9, 0xD1, 0xD9];
const INK: Rgb = [0x0B, 0x12, 0x1A];

// A classic 5x7 bitmap face: enough for Latin letters, digits and the punctuation a label carries.
const GLYPHS: Record<string, readonly string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ":": [".....", "..##.", "..##.", ".....", "..##.", "..##.", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", "..##.", "..##."],
  ",": [".....", ".....", ".....", ".....", "..##.", "..##.", ".#..."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "(": ["..#..", ".#...", "#....", "#....", "#....", ".#...", "..#.."],
  ")": ["..#..", "...#.", "....#", "....#", "....#", "...#.", "..#.."],
  "'": [".##..", ".##..", ".#...", ".....", ".....", ".....", "....."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "_": [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  "@": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#....", ".###."],
  "&": [".##..", "#..#.", "#..#.", ".##..", "#.#.#", "#..#.", ".##.#"],
  "%": ["##..#", "##..#", "...#.", "..#..", ".#...", "#..##", "#..##"],
  "\"": [".#.#.", ".#.#.", ".#.#.", ".....", ".....", ".....", "....."],
  "⎕": [".###.", ".#.#.", ".#.#.", ".#.#.", ".#.#.", ".#.#.", ".###."],
};
const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const ADVANCE = 6;

function glyph(character: string): readonly string[] {
  const upper = character.toUpperCase();
  return GLYPHS[upper] ?? (upper === "×" ? GLYPHS.X! : GLYPHS["⎕"]!);
}

class Raster {
  readonly width: number;
  readonly height: number;
  readonly pixels: Buffer;

  constructor(width: number, height: number, ground: Rgb) {
    this.width = width;
    this.height = height;
    this.pixels = Buffer.alloc(width * height * 3);
    for (let index = 0; index < width * height; index += 1) {
      this.pixels[index * 3] = ground[0];
      this.pixels[index * 3 + 1] = ground[1];
      this.pixels[index * 3 + 2] = ground[2];
    }
  }

  blend(x: number, y: number, color: Rgb, alpha: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const offset = (y * this.width + x) * 3;
    for (let channel = 0; channel < 3; channel += 1) {
      const current = this.pixels[offset + channel]!;
      this.pixels[offset + channel] = Math.round(current + (color[channel]! - current) * alpha);
    }
  }

  fill(x: number, y: number, width: number, height: number, color: Rgb, alpha = 1): void {
    const left = Math.max(0, x);
    const top = Math.max(0, y);
    const right = Math.min(this.width, x + width);
    const bottom = Math.min(this.height, y + height);
    for (let row = top; row < bottom; row += 1) {
      for (let column = left; column < right; column += 1) {
        if (alpha >= 1) {
          const offset = (row * this.width + column) * 3;
          this.pixels[offset] = color[0]; this.pixels[offset + 1] = color[1]; this.pixels[offset + 2] = color[2];
        } else {
          this.blend(column, row, color, alpha);
        }
      }
    }
  }

  /** Draw text whose glyph origin is the top-left corner; returns the advance in pixels. */
  text(value: string, x: number, y: number, scale: number, color: Rgb, alpha = 1): number {
    let cursor = x;
    for (const character of value) {
      const rows = glyph(character);
      for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
        for (let column = 0; column < GLYPH_WIDTH; column += 1) {
          if (rows[row]![column] === "#") this.fill(cursor + column * scale, y + row * scale, scale, scale, color, alpha);
        }
      }
      cursor += ADVANCE * scale;
    }
    return cursor - x;
  }

  /** The same text stepped along a 45° line, one glyph per step; the watermark reads diagonally. */
  diagonalText(value: string, x: number, y: number, scale: number, color: Rgb, alpha: number): void {
    const step = GLYPH_WIDTH * scale;
    let index = 0;
    for (const character of value) {
      const rows = glyph(character);
      const originX = x + index * step;
      const originY = y + index * step;
      for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
        for (let column = 0; column < GLYPH_WIDTH; column += 1) {
          if (rows[row]![column] === "#") this.fill(originX + column * scale, originY + row * scale, scale, scale, color, alpha);
        }
      }
      index += 1;
    }
  }

  png(): Uint8Array {
    const stride = this.width * 3;
    const scanlines = Buffer.alloc(this.height * (1 + stride));
    for (let row = 0; row < this.height; row += 1) {
      scanlines[row * (1 + stride)] = 0;
      this.pixels.copy(scanlines, row * (1 + stride) + 1, row * stride, (row + 1) * stride);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(this.width, 0);
    header.writeUInt32BE(this.height, 4);
    header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0;
    return Uint8Array.from(Buffer.concat([
      Buffer.from("\x89PNG\r\n\x1a\n", "binary"),
      Buffer.from(pngChunk("IHDR", header)),
      Buffer.from(pngChunk("IDAT", deflateSync(scanlines))),
      Buffer.from(pngChunk("IEND", new Uint8Array())),
    ]));
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(type.length + data.length);
  for (let index = 0; index < type.length; index += 1) body[index] = type.charCodeAt(index);
  body.set(data, type.length);
  const result = new Uint8Array(12 + data.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(body, 4);
  view.setUint32(8 + data.length, crc32(body));
  return result;
}

function textWidth(value: string, scale: number): number {
  return Math.max(0, [...value].length * ADVANCE * scale - scale);
}

function seconds(video: NonNullable<StandInCardRequest["video"]>): number {
  return video.frameCount * video.frameRate.denominator / video.frameRate.numerator;
}

function timecode(frame: number, video: NonNullable<StandInCardRequest["video"]>): string {
  const fps = video.frameRate.numerator / video.frameRate.denominator;
  const total = frame / fps;
  const minutes = Math.floor(total / 60);
  const wholeSeconds = Math.floor(total - minutes * 60);
  const frames = frame - Math.round((minutes * 60 + wholeSeconds) * fps);
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${two(minutes)}:${two(wholeSeconds)}.${two(Math.max(0, frames))}`;
}

type Layout = {
  readonly border: number;
  readonly band: number;
  readonly margin: number;
};

function layout(request: StandInCardRequest): Layout {
  const m = Math.min(request.width, request.height);
  const border = Math.max(6, Math.round(m * 0.03));
  const band = request.kind === "video" ? Math.max(36, Math.round(request.height * 0.06)) : 0;
  return { border, band, margin: border * 2 };
}

/** The still part of the card: everything but the timecode band. */
export function drawStandInCard(request: StandInCardRequest): Uint8Array {
  verifyStandInCardRequest(request);
  const { width, height } = request;
  const m = Math.min(width, height);
  const { border, band, margin } = layout(request);
  const raster = new Raster(width, height, GROUND[request.kind]);

  // Diagonal watermark: stepped 45° lines of STAND-IN across the whole ground, faint.
  const markScale = Math.max(2, Math.floor(m / 220));
  const word = "STAND-IN   ";
  const wordSpan = word.length * GLYPH_WIDTH * markScale;
  const lineGap = Math.max(GLYPH_HEIGHT * markScale * 3, Math.round(m * 0.22));
  for (let start = -height; start < width; start += lineGap) {
    for (let along = 0; start + along < width + wordSpan && along < width + height; along += wordSpan) {
      raster.diagonalText(word, start + along, along, markScale, TEXT, 0.09);
    }
  }

  // Border.
  raster.fill(0, 0, width, border, ACCENT);
  raster.fill(0, height - border, width, border, ACCENT);
  raster.fill(0, 0, border, height, ACCENT);
  raster.fill(width - border, 0, border, height, ACCENT);

  // Corner tag.
  const tagScale = Math.max(2, Math.floor(m / 260));
  raster.text("STAND-IN", margin, margin, tagScale, ACCENT);
  const kindTag = request.kind === "video" ? "NOT YET GENERATED" : "NOT YET GENERATED";
  raster.text(kindTag, width - margin - textWidth(kindTag, tagScale), margin, tagScale, MUTED);

  // Centre block: only the generic media shape selected by the Run.
  const titleScale = Math.max(4, Math.floor(m / 70));
  const lineScale = Math.max(2, Math.floor(m / 200));
  const title = request.kind.toUpperCase();
  const frameLine = request.video === undefined
    ? `${width} X ${height}`
    : `${width} X ${height}   ${seconds(request.video).toFixed(2)} S   ${(request.video.frameRate.numerator / request.video.frameRate.denominator).toFixed(2)} FPS`;
  const blockHeight = GLYPH_HEIGHT * titleScale + lineScale * 6
    + GLYPH_HEIGHT * lineScale;
  let y = Math.round((height - band - blockHeight) / 2);
  const centred = (value: string, scale: number, color: Rgb): void => {
    raster.text(value, Math.round((width - textWidth(value, scale)) / 2), y, scale, color);
    y += GLYPH_HEIGHT * scale;
  };
  centred(title, titleScale, TEXT);
  y += lineScale * 6;
  centred(frameLine, lineScale, MUTED);
  return raster.png();
}

export function drawStandInSilence(sampleFrames: number): Uint8Array {
  if (!Number.isSafeInteger(sampleFrames) || sampleFrames < 1) {
    throw new Error("Stand-in silence sampleFrames must be a positive integer");
  }
  const dataBytes = sampleFrames * 2 * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(48_000, 24);
  wav.writeUInt32LE(48_000 * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);
  return Uint8Array.from(wav);
}

/** The band a video card carries under its picture: timecode, frame counter and progress bar. */
export function drawStandInBand(request: StandInCardRequest, frame: number): Uint8Array {
  verifyStandInCardRequest(request);
  const video = request.video;
  if (video === undefined) throw new Error("only a video stand-in has a timecode band");
  const { width } = request;
  const { border, band, margin } = layout(request);
  const raster = new Raster(width, band, INK);
  raster.fill(0, 0, border, band, ACCENT);
  raster.fill(width - border, 0, border, band, ACCENT);
  const scale = Math.max(2, Math.floor((band - border) / (GLYPH_HEIGHT + 4)));
  const textY = Math.round((band - border - GLYPH_HEIGHT * scale) / 2);
  raster.text(timecode(frame, video), margin, textY, scale, TEXT);
  const counter = `F ${frame + 1}/${video.frameCount}`;
  raster.text(counter, width - margin - textWidth(counter, scale), textY, scale, MUTED);
  raster.fill(0, band - border, width, border, INK);
  raster.fill(0, band - border, Math.round(width * (frame + 1) / video.frameCount), border, ACCENT);
  return raster.png();
}

export type StandInDrawingEnvironment = {
  readonly ffmpegPath: string;
  readonly processTimeoutMs: number;
  readonly runFfmpeg: (argv: readonly string[]) => Promise<void>;
  readonly inspectStreams: (path: string) => Promise<readonly MediaStream[]>;
  readonly putBytes: (bytes: Uint8Array, mediaType: string) => Promise<CanonicalValue>;
  readonly putFile: (path: string, mediaType: string) => Promise<CanonicalValue>;
};

export function standInCardNeed(value: CanonicalValue): StandInCardRequest {
  verifyStandInCardRequest(value);
  return value;
}

/** Draw the card; a video card is the still card with its band composited frame by frame by ffmpeg. */
export async function renderStandInCard(
  env: StandInDrawingEnvironment,
  request: StandInCardRequest,
): Promise<CanonicalValue> {
  const still = drawStandInCard(request);
  if (request.video === undefined) return await env.putBytes(still, "image/png");
  const video = request.video;
  const work = await mkdtemp(join(tmpdir(), "hypit-stand-in-"));
  try {
    const base = join(work, "card.png");
    await writeFile(base, still);
    for (let frame = 0; frame < video.frameCount; frame += 1) {
      await writeFile(join(work, `band-${String(frame).padStart(6, "0")}.png`), drawStandInBand(request, frame));
    }
    const fps = `${video.frameRate.numerator}/${video.frameRate.denominator}`;
    const output = join(work, "card.mp4");
    const silence = video.audio === "silence";
    await env.runFfmpeg([
      "-y",
      "-loop", "1", "-framerate", fps, "-i", base,
      "-framerate", fps, "-i", join(work, "band-%06d.png"),
      ...(silence ? ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"] : []),
      "-filter_complex", "[0:v][1:v]overlay=0:main_h-overlay_h:shortest=1,format=yuv420p[v]",
      "-map", "[v]", ...(silence ? ["-map", "2:a:0", "-c:a", "aac", "-b:a", "96k", "-shortest"] : []),
      "-frames:v", String(video.frameCount), "-r", fps, "-fps_mode", "cfr",
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", output,
    ]);
    const streams = await env.inspectStreams(output);
    const visual = streams.find((item) => item.kind === "video");
    const audio = streams.filter((item) => item.kind === "audio");
    if (visual === undefined || visual.kind !== "video" || visual.decodedUnitCount !== video.frameCount
      || visual.width !== request.width || visual.height !== request.height
      || streams.length !== 1 + audio.length || audio.length !== (silence ? 1 : 0)) {
      throw new Error("Stand-in video differs from its requested frame domain");
    }
    return await env.putFile(output, "video/mp4");
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
