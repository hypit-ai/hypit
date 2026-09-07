import { deflateSync } from "node:zlib";

import type { CanonicalValue } from "@hypit/protocol";
import { verifyStandInCardRequest } from "@hypit/stand-in";
import type { StandInCardRequest } from "@hypit/stand-in";

/**
 * A generic stand-in card, drawn from only the media shape a Run supplies.
 *
 * The card is pixels, not a model call. Everything is drawn here with a built-in 5x7 bitmap font,
 * so the same card comes out of every machine. The PNG is deterministic for a given request.
 */

type Rgb = readonly [number, number, number];

const GROUND: Rgb = [0x17, 0x23, 0x32];
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

export type ClipTimeGuideRequest = {
  readonly width: number;
  readonly height: number;
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly frameCount: number;
};

function timecode(
  frame: number,
  video: Pick<ClipTimeGuideRequest, "frameRate" | "frameCount">,
): string {
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
  readonly margin: number;
};

function layout(request: StandInCardRequest): Layout {
  const m = Math.min(request.width, request.height);
  const border = Math.max(6, Math.round(m * 0.03));
  return { border, margin: border * 2 };
}

/** Draw one neutral Card. Timing, if needed, belongs to the StillVideo that displays it. */
export function drawStandInCard(request: StandInCardRequest): Uint8Array {
  verifyStandInCardRequest(request);
  const { width, height } = request;
  const m = Math.min(width, height);
  const { border, margin } = layout(request);
  const raster = new Raster(width, height, GROUND);

  // A quiet visual field gives components something visible to sit over without pretending to be
  // a generated subject. The blocks scale with the requested canvas and carry no media semantics.
  const cell = Math.max(16, Math.round(m * 0.08));
  for (let y = border; y < height - border; y += cell) {
    for (let x = border; x < width - border; x += cell) {
      if (((x / cell) + (y / cell)) % 3 < 1) raster.fill(x, y, cell, cell, TEXT, 0.018);
    }
  }

  // Border.
  raster.fill(0, 0, width, border, ACCENT);
  raster.fill(0, height - border, width, border, ACCENT);
  raster.fill(0, 0, border, height, ACCENT);
  raster.fill(width - border, 0, border, height, ACCENT);

  // One label is enough; the rest of the card communicates by shape and colour.
  const tagScale = Math.max(2, Math.floor(m / 260));
  raster.text("STAND-IN", margin, margin, tagScale, ACCENT);

  const frameWidth = Math.max(Math.round(width * 0.42), margin * 5);
  const frameHeight = Math.max(Math.round(height * 0.28), margin * 4);
  const frameX = Math.round((width - frameWidth) / 2);
  const frameY = Math.round((height - frameHeight) / 2);
  const stroke = Math.max(3, Math.round(border / 2));
  raster.fill(frameX, frameY, frameWidth, stroke, MUTED, 0.75);
  raster.fill(frameX, frameY + frameHeight - stroke, frameWidth, stroke, MUTED, 0.75);
  raster.fill(frameX, frameY, stroke, frameHeight, MUTED, 0.75);
  raster.fill(frameX + frameWidth - stroke, frameY, stroke, frameHeight, MUTED, 0.75);
  raster.fill(frameX + stroke * 4, frameY + frameHeight - stroke * 6,
    Math.round(frameWidth * 0.34), stroke * 2, ACCENT, 0.9);
  raster.fill(frameX + Math.round(frameWidth * 0.58), frameY + stroke * 4,
    stroke * 4, stroke * 4, TEXT, 0.55);

  const lineScale = Math.max(2, Math.floor(m / 200));
  const frameLine = `${width} X ${height}`;
  raster.text(frameLine, Math.round((width - textWidth(frameLine, lineScale)) / 2),
    frameY + frameHeight + margin, lineScale, MUTED);
  return raster.png();
}

/** The band a video card carries under its picture: timecode, frame counter and progress bar. */
export function drawClipTimeGuide(request: ClipTimeGuideRequest, frame: number): Uint8Array {
  const { width, height, frameRate, frameCount } = request;
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= frameCount) {
    throw new Error("Clip time guide frame lies outside its clip");
  }
  const border = Math.max(6, Math.round(Math.min(width, height) * 0.03));
  const band = Math.max(36, Math.round(height * 0.06));
  const margin = border * 2;
  const raster = new Raster(width, band, INK);
  raster.fill(0, 0, border, band, ACCENT);
  raster.fill(width - border, 0, border, band, ACCENT);
  const scale = Math.max(2, Math.floor((band - border) / (GLYPH_HEIGHT + 4)));
  const textY = Math.round((band - border - GLYPH_HEIGHT * scale) / 2);
  raster.text(timecode(frame, { frameRate, frameCount }), margin, textY, scale, TEXT);
  const counter = `F ${frame + 1}/${frameCount}`;
  raster.text(counter, width - margin - textWidth(counter, scale), textY, scale, MUTED);
  raster.fill(0, band - border, width, border, INK);
  raster.fill(0, band - border, Math.round(width * (frame + 1) / frameCount), border, ACCENT);
  return raster.png();
}

export type StandInDrawingEnvironment = {
  readonly putBytes: (bytes: Uint8Array, mediaType: string) => Promise<CanonicalValue>;
};

export function standInCardNeed(value: CanonicalValue): StandInCardRequest {
  verifyStandInCardRequest(value);
  return value;
}

/** Draw the Card image. */
export async function renderStandInCard(
  env: StandInDrawingEnvironment,
  request: StandInCardRequest,
): Promise<CanonicalValue> {
  return await env.putBytes(drawStandInCard(request), "image/png");
}
