/**
 * The route's one placeholder: a flat fill with a contrasting inset border, at whatever size the
 * Canvas asks for.
 *
 * It is written here rather than inside the tool that first needed it because the comparison render
 * needs dozens of them per round. Reaching them through the CLI meant a Node process, and a TypeScript
 * compile, per mock — forty-five of those cost more than drawing every frame they stand in for.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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
  for (let i = 0; i < type.length; i += 1) body[i] = type.charCodeAt(i);
  body.set(data, type.length);
  const out = new Uint8Array(8 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(4 + body.length, crc32(body));
  return out;
}

const PLACEHOLDER_COLORS = {
  light: "#E8EAED",   // default — visible on a dark base
  mid: "#9AA0A6",
  dark: "#5F6368",    // visible on a light base
  white: "#FFFFFF",
  black: "#202124",
} as const;

type PlaceholderPalette = {
  readonly base: [number, number, number];
  readonly border: [number, number, number];
  readonly hex: string;
};

/**
 * Resolve the mock's colour: one of the named presets, or a six-digit hex. The inset border is the
 * contrast of the base — a dark border on a light fill, a light border on a dark fill — so the
 * placeholder stays visible whichever base it sits on, which is the point of choosing at all: a mock
 * the same shade as its surroundings is one the observer reads as a hole rather than a slot.
 */
function resolvePlaceholderColor(value: string | undefined): PlaceholderPalette {
  const named = value === undefined ? PLACEHOLDER_COLORS.light
    : (PLACEHOLDER_COLORS as Record<string, string>)[value];
  const hex = named ?? value ?? PLACEHOLDER_COLORS.light;
  assert(named !== undefined || /^#[0-9a-f]{6}$/iu.test(value!),
    `color must be one of ${Object.keys(PLACEHOLDER_COLORS).join(", ")} or a six-digit hex like #E0E0E0.`);
  const base: [number, number, number] = [
    parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
  ];
  const luminance = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2];
  const border: [number, number, number] = luminance > 128 ? [32, 33, 36] : [232, 234, 237];
  return { base, border, hex };
}

/**
 * A correctly-sized placeholder image for a media slot the Source declares as a generation and a
 * Build has not filled. The comparison round needs a still; the slot must be mocked, and the mock is
 * this tool's output — deterministic, Provider-free, never a real generation and never a hand-rolled
 * script. A field with an inset frame reads as a slot waiting for content rather than a broken
 * image, so the observer can bypass the region instead of reporting it every round.
 */
function placeholderPng(width: number, height: number, palette: PlaceholderPalette): Uint8Array {
  const { base, border } = palette;
  const raw = Buffer.alloc(height * (1 + width * 3));
  // A hairline, not a band. At a twentieth of the shorter side the frame was fifty pixels thick on a
  // full-frame mock, and an observer measuring what the element covers read that as the element
  // stopping short of the edge — "does not span the full width", reported every round, about the
  // mock rather than about anything the Source says. It has to be visible enough to read as a slot
  // and thin enough to measure as nothing.
  const margin = Math.max(1, Math.round(Math.min(width, height) * 0.004));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + width * 3)] = 0;
    for (let x = 0; x < width; x += 1) {
      const c = (x < margin || y < margin || x >= width - margin || y >= height - margin) ? border : base;
      const i = y * (1 + width * 3) + 1 + x * 3;
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Uint8Array.from(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]));
}

export type PlaceholderRequest = {
  readonly out: string;
  readonly width: number;
  readonly height: number;
  readonly color?: string;
  readonly video?: boolean;
  readonly seconds?: number;
};

/** Write one placeholder and report what it wrote, in the shape the CLI returns. */
export async function writePlaceholder(input: PlaceholderRequest): Promise<Record<string, unknown>> {
  const palette = resolvePlaceholderColor(input.color);
  const out = resolve(input.out);
  await mkdir(dirname(out), { recursive: true });
  if (input.video === true) {
    // A slot that only accepts video needs a real video artifact; a short solid-colour clip is the
    // mock. ffmpeg is part of the required local toolchain.
    const seconds = input.seconds ?? 1;
    const filter = `color=c=${palette.hex.slice(1)}:s=${input.width}x${input.height}:r=24:d=${seconds}`;
    const result = await new Promise<{ status: number | null; error?: Error }>((done) => {
      const child = spawn("ffmpeg", [
        "-y", "-f", "lavfi", "-i", filter, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", String(seconds), out,
      ]);
      child.on("close", (status) => done({ status }));
      child.on("error", (error) => done({ status: null, error }));
    });
    assert(result.status === 0,
      `ffmpeg failed to write a placeholder video (${result.error?.message ?? `exit ${result.status}`}); ffmpeg is part of the required local toolchain`);
    return { out, width: input.width, height: input.height, color: palette.hex, video: true, seconds };
  }
  await writeFile(out, placeholderPng(input.width, input.height, palette));
  return { out, width: input.width, height: input.height, color: palette.hex, video: false };
}

export { resolvePlaceholderColor, placeholderPng };
export type { PlaceholderPalette };
