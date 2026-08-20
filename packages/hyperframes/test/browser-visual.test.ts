import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { semanticTrackFixture } from "../../../test/semantic-track-fixture.js";
import { deflateSync } from "node:zlib";
import { resolveCaptionProgram } from "@hypit/caption";
import type { TimedCaptionProjection } from "@hypit/caption";
import { fineCaptionStyle, renderFineCaption } from "@hypit/caption-fine";
import * as deckTrack from "@hypit/deck-track";
import type { DepthStackCardLabel } from "@hypit/deck-track";
import { decodeOpenFontFaceSurface } from "@hypit/fonts-open";
import type { CompositableSurfaceRef, FontArtifactRef } from "@hypit/media";
import * as mediaTrack from "@hypit/media-track";
import { sealProgramSpace } from "@hypit/program-space";
import { sealComposition, sealVisualTrack } from "@hypit/composition";
import assert from "node:assert/strict";
import {
  compileHyperframesDocument,
  materializeHyperframesHtml,
} from "@hypit/hyperframes";
import type { BlobRef, Digest } from "@hypit/protocol";
import { captionDisplaySequence, parseScript } from "@hypit/script";
import * as rankingTrack from "@hypit/ranking";
import {
  appendProgramScreenOverlay,
  createScreenOverlaySet,
  finalizeScreenOverlay,
  renderScreenOverlay,
  sealScreenOverlayHeader,
  sealScreenOverlayItemSpec,
} from "@hypit/screen-overlay";
import type { ScreenOverlayComponent, ScreenOverlaySet } from "@hypit/screen-overlay";
import { sealCanvasSpace } from "@hypit/spatial";
import type { SvsRecipe } from "@hypit/svs";
import {
  renderTextMaskTrack,
  renderTypographyTrack,
  sealTextMaskSpec,
  sealTextMotion,
  sealTextStyle,
  sealTypographyTrackProgram,
  stillTextMotion,
} from "@hypit/typography-track";
import type { TextStyle } from "@hypit/typography-track";

const enabled = process.env.HYPIT_BROWSER_TESTS === "1";
const localFont = process.env.HYPIT_TEST_FONT_PATH
  ?? (process.platform === "darwin" ? "/System/Library/Fonts/SFNSMono.ttf" : undefined);
const hyperframesCli = createRequire(path.join(process.cwd(), "packages/provider-hyperframes-local/package.json"))
  .resolve("hyperframes/bin/hyperframes.mjs");

function digest(bytes: Uint8Array): Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Digest;
}

async function installedOpenFont(
  family: string,
  weight: number,
  style: "normal" | "italic",
): Promise<{ readonly font: FontArtifactRef; readonly bytes: ReadonlyMap<Digest, Uint8Array> }> {
  const bytes = new Map<Digest, Uint8Array>();
  const output = await decodeOpenFontFaceSurface({
    sourceName: "browser-visual.svml",
    element: {
      kind: "element",
      name: "fonts:Face",
      attributes: { id: `${family}-${weight}-${style}`, family, weight: String(weight), style },
      children: [],
      range: { start: 0, end: 1 },
    },
    resolveReference: () => undefined,
    resolveAsset(request) {
      assert(request.bytes !== undefined);
      const copy = Uint8Array.from(request.bytes);
      const artifactDigest = digest(copy);
      bytes.set(artifactDigest, copy);
      return {
        artifact: {
          kind: "blob",
          digest: artifactDigest,
          size: copy.byteLength,
          mediaType: request.mediaType,
        },
      };
    },
  });
  const stored = output.records[0]?.value;
  assert(stored?.kind === "inline");
  return { font: stored.value as FontArtifactRef, bytes };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb8_8320 & -(crc & 1));
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function pngChunk(name: string, data: Uint8Array): Buffer {
  const type = Buffer.from(name, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength);
  const body = Buffer.concat([type, data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function rgbaPng(width: number, height: number, rgba: readonly [number, number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    rows[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = row + 1 + x * 4;
      rows[pixel] = rgba[0];
      rows[pixel + 1] = rgba[1];
      rows[pixel + 2] = rgba[2];
      rows[pixel + 3] = rgba[3];
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function findPng(directory: string): Promise<string | undefined> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findPng(absolute);
      if (nested !== undefined) return nested;
    } else if (entry.name.endsWith(".png")) {
      return absolute;
    }
  }
  return undefined;
}

async function collectPngs(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collectPngs(absolute));
    else if (entry.name.endsWith(".png")) result.push(absolute);
  }
  return result.sort();
}

function yellowPixelsByColumns(file: string, width: number, height: number, columns: number): number[] {
  const decoded = spawnSync("ffmpeg", [
    "-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1",
  ], { windowsHide: true, encoding: "buffer", timeout: 30_000, maxBuffer: Math.max(16 * 1024 * 1024, width * height * 4 + 1024) });
  assert.equal(decoded.status, 0, decoded.stderr.toString());
  assert.equal(decoded.stdout.byteLength, width * height * 4);
  const counts = Array.from({ length: columns }, () => 0);
  for (let index = 0; index < decoded.stdout.byteLength; index += 4) {
    if (decoded.stdout[index]! > 180 && decoded.stdout[index + 1]! > 130 && decoded.stdout[index + 2]! < 140) {
      const pixel = index / 4;
      const x = pixel % width;
      const column = Math.min(columns - 1, Math.floor(x * columns / width));
      counts[column]! += 1;
    }
  }
  return counts;
}

function decodedRgba(file: string, width: number, height: number): Buffer {
  const decoded = spawnSync("ffmpeg", [
    "-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1",
  ], { windowsHide: true, encoding: "buffer", timeout: 30_000, maxBuffer: Math.max(16 * 1024 * 1024, width * height * 4 + 1024) });
  assert.equal(decoded.status, 0, decoded.stderr.toString());
  assert.equal(decoded.stdout.byteLength, width * height * 4);
  return decoded.stdout;
}

function matchingPixels(
  rgba: Buffer,
  width: number,
  region: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
  predicate: (red: number, green: number, blue: number, alpha: number) => boolean,
): number {
  let count = 0;
  for (let y = region.top; y < region.bottom; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      const index = (y * width + x) * 4;
      if (predicate(rgba[index]!, rgba[index + 1]!, rgba[index + 2]!, rgba[index + 3]!)) count += 1;
    }
  }
  return count;
}

function rgbaDifference(left: Buffer, right: Buffer): {
  readonly pixels: number;
  readonly channels: number;
  readonly maximum: number;
  readonly total: number;
} {
  assert.equal(left.byteLength, right.byteLength);
  let pixels = 0;
  let channels = 0;
  let maximum = 0;
  let total = 0;
  for (let index = 0; index < left.byteLength; index += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(left[index + channel]! - right[index + channel]!);
      if (delta === 0) continue;
      changed = true;
      channels += 1;
      maximum = Math.max(maximum, delta);
      total += delta;
    }
    if (changed) pixels += 1;
  }
  return { pixels, channels, maximum, total };
}

function matchingBounds(
  rgba: Buffer,
  width: number,
  region: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
  predicate: (red: number, green: number, blue: number, alpha: number) => boolean,
): { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number } | undefined {
  let left = region.right;
  let top = region.bottom;
  let right = region.left;
  let bottom = region.top;
  let found = false;
  for (let y = region.top; y < region.bottom; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      const index = (y * width + x) * 4;
      if (!predicate(rgba[index]!, rgba[index + 1]!, rgba[index + 2]!, rgba[index + 3]!)) continue;
      found = true;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  return found ? { left, top, right, bottom } : undefined;
}

function longestHorizontalRun(
  rgba: Buffer,
  width: number,
  height: number,
  predicate: (red: number, green: number, blue: number, alpha: number) => boolean,
): number {
  let longest = 0;
  for (let y = 0; y < height; y += 1) {
    let run = 0;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (predicate(rgba[index]!, rgba[index + 1]!, rgba[index + 2]!, rgba[index + 3]!)) {
        run += 1;
        longest = Math.max(longest, run);
      } else {
        run = 0;
      }
    }
  }
  return longest;
}

test("locked font and straight-alpha Surface survive one real Hyperframes browser frame", {
  skip: !enabled || localFont === undefined,
  timeout: 120_000,
}, async () => {
  assert(localFont !== undefined);
  const temp = await mkdtemp(path.join(os.tmpdir(), "hypit-hyperframes-visual-"));
  try {
    const fontBytes = await import("node:fs/promises").then(({ readFile }) => readFile(localFont));
    const surfaceBytes = rgbaPng(64, 64, [255, 0, 0, 128]);
    const fontDigest = digest(fontBytes);
    const surfaceDigest = digest(surfaceBytes);
    const font: FontArtifactRef = {
      sources: [{ artifact: { kind: "blob", digest: fontDigest, size: fontBytes.byteLength, mediaType: "font/ttf" } }],
      weight: 400,
      style: "normal",
    };
    const space = sealProgramSpace({
      durationSec: 1 / 30,
      frameRate: { numerator: 30, denominator: 1 },
    });
    const lower = sealVisualTrack({
      visualIr: "hypit.visual-ir@1",
      id: "blue",
      presents: [{
        id: "blue",
        span: { startFrame: 0, endFrameExclusive: 1 },
        stacking: { order: 10, tieBreak: "blue" },
        elements: [{
          id: "blue",
          order: 0,
          kind: "box",
          style: [
            { name: "position", value: "absolute" },
            { name: "inset", value: 0 },
            { name: "background-color", value: "#0000ff" },
          ],
        }],
      }],
    });
    const surface = sealVisualTrack({
      visualIr: "hypit.visual-ir@1",
      id: "surface",
      presents: [{
        id: "surface",
        span: { startFrame: 0, endFrameExclusive: 1 },
        stacking: { order: 20, tieBreak: "surface" },
        elements: [{
          id: "surface",
          order: 0,
          kind: "surface",
          surface: {
            artifact: { kind: "blob", digest: surfaceDigest, size: surfaceBytes.byteLength, mediaType: "image/png" },
            width: 64,
            height: 64,
            colorSpace: "srgb",
            alphaMode: "straight",
            timing: { kind: "still" },
          },
          style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }, { name: "width", value: "100%" }, { name: "height", value: "100%" }],
        }],
      }],
    });
    const text = sealVisualTrack({
      visualIr: "hypit.visual-ir@1",
      id: "text",
      presents: [{
        id: "text",
        span: { startFrame: 0, endFrameExclusive: 1 },
        stacking: { order: 30, tieBreak: "text" },
        elements: [{
          id: "text",
          order: 0,
          kind: "text",
          text: "I",
          fonts: [font],
          style: [
            { name: "position", value: "absolute" },
            { name: "left", value: "4px" },
            { name: "top", value: "0px" },
            { name: "font-size", value: "28px" },
            { name: "line-height", value: 1 },
            { name: "color", value: "#ffffff" },
          ],
        }],
      }],
    });
    const document = compileHyperframesDocument(sealComposition({
      id: "visual-proof",
      canvas: { width: 64, height: 64, clearColor: "#000000" },
      tracks: [text, lower, surface],
    }), space);

    await copyFile(localFont, path.join(temp, "font.ttf"));
    await writeFile(path.join(temp, "surface.png"), surfaceBytes);
    const html = materializeHyperframesHtml(document, (artifact) => {
      if (artifact.digest === fontDigest) return "./font.ttf";
      if (artifact.digest === surfaceDigest) return "./surface.png";
      throw new Error(`Unexpected visual-test Artifact ${artifact.digest}`);
    });
    await writeFile(path.join(temp, "index.html"), html);
    const output = path.join(temp, "frames");
    await mkdir(output);
    const render = spawnSync(process.execPath, [
      hyperframesCli,
      "render",
      temp,
      "--format", "png-sequence",
      "--output", output,
      "--fps", "30",
      "--workers", "1",
      "--no-browser-gpu",
      "--no-best-effort",
      "--quiet",
    ], { windowsHide: true, encoding: "utf8", timeout: 110_000 });
    assert.equal(render.status, 0, `${render.stdout}\n${render.stderr}`);
    const renderedFrame = await findPng(output);
    assert(renderedFrame !== undefined, "Hyperframes did not emit a PNG frame.");
    const decoded = spawnSync("ffmpeg", [
      "-v", "error",
      "-i", renderedFrame,
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      "pipe:1",
    ], { windowsHide: true, encoding: "buffer", timeout: 30_000 });
    assert.equal(decoded.status, 0, decoded.stderr.toString());
    assert.equal(decoded.stdout.byteLength, 64 * 64 * 4);
    const center = (32 * 64 + 32) * 4;
    const red = decoded.stdout[center]!;
    const green = decoded.stdout[center + 1]!;
    const blue = decoded.stdout[center + 2]!;
    const alpha = decoded.stdout[center + 3]!;
    assert.ok(red >= 120 && red <= 136, `unexpected composited red ${red}`);
    assert.ok(green <= 5, `unexpected composited green ${green}`);
    assert.ok(blue >= 119 && blue <= 135, `unexpected composited blue ${blue}`);
    assert.equal(alpha, 255);
    let whitePixels = 0;
    for (let index = 0; index < decoded.stdout.byteLength; index += 4) {
      if (decoded.stdout[index]! > 235 && decoded.stdout[index + 1]! > 235 && decoded.stdout[index + 2]! > 235) whitePixels += 1;
    }
    assert.ok(whitePixels > 0, "the exact-font text did not paint any white pixels");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Fine Caption exact font, wrapping and all karaoke modes survive real browser frames", {
  skip: !enabled || localFont === undefined,
  timeout: 120_000,
}, async () => {
  assert(localFont !== undefined);
  const temp = await mkdtemp(path.join(os.tmpdir(), "hypit-caption-fine-visual-"));
  try {
    const width = 720;
    const height = 240;
    const space = sealProgramSpace({
      durationSec: 4,
      frameRate: { numerator: 10, denominator: 1 },
    });
    const narrative = parseScript("visual.svml", "<line>One two three four.</line>");
    const display = captionDisplaySequence(narrative, "visual.caption");
    const fontBytes = await import("node:fs/promises").then(({ readFile }) => readFile(localFont));
    const font: FontArtifactRef = {
      sources: [{ artifact: { kind: "blob", digest: digest(fontBytes), size: fontBytes.byteLength, mediaType: "font/ttf" } }],
      weight: 400,
      style: "normal",
    };
    const modes = [
      { mode: "current", transition: "step" },
      { mode: "current", transition: "wipe" },
      { mode: "trail", transition: "step" },
      { mode: "trail", transition: "wipe" },
    ] as const;
    const tracks = modes.map(({ mode, transition }, index) => {
      const recipe: SvsRecipe = {

        path: `caption.${mode}-${transition}`,
        properties: {
          "cue-min-words": 1, "cue-max-words": 4,
          "stack-order": 10 + index, x: 0.125 + index * 0.25, y: 0.82, width: 0.22,
          "anchor-x": "center", "anchor-y": "bottom",
          size: 32, "line-height": 1,
          align: "center", fill: "#FFFFFF",
          "stroke-color": "#000000", "stroke-width": 1,
          "shadow-color": "#000000", "shadow-opacity": 0.8,
          "shadow-x": 0, "shadow-y": 2, "shadow-blur": 3,
          background: "#111111CC", padding: "8 10", radius: 8,
          karaoke: mode, "karaoke-transition": transition, "active-fill": "#FFD54A",
        },
      };
      const style = fineCaptionStyle(`${mode}-${transition}`, recipe, [font]);
      const program = resolveCaptionProgram(display, `${mode}-${transition}-program`, style, []);
      const projection: TimedCaptionProjection = {

        displaySequenceId: display.id,
        cues: [{
          id: `${mode}-${transition}-cue`, styleId: style.id,
          startFrame: 0, endFrameExclusive: 40,
          atoms: display.atoms.map((atom, atomIndex) => ({
            atomId: atom.id, startFrame: atomIndex * 10, endFrameExclusive: (atomIndex + 1) * 10,
          })),
          fields: [],
        }],
      };
      return renderFineCaption(projection, program, display, space);
    });
    const document = compileHyperframesDocument(sealComposition({
      id: "caption-fine-visual",
      canvas: { width, height, clearColor: "#000000" },
      tracks,
    }), space);
    assert.deepEqual(document.artifacts, [font.sources[0]!.artifact]);
    await copyFile(localFont, path.join(temp, "caption.ttf"));
    await writeFile(path.join(temp, "index.html"), materializeHyperframesHtml(document, (artifact) => {
      if (artifact.digest === font.sources[0]!.artifact.digest) return "./caption.ttf";
      throw new Error(`Unexpected Fine Caption visual-test Artifact ${artifact.digest}`);
    }));
    const output = path.join(temp, "frames");
    await mkdir(output);
    const render = spawnSync(process.execPath, [
      hyperframesCli, "render", temp,
      "--format", "png-sequence", "--output", output, "--fps", "10", "--workers", "1",
      "--no-browser-gpu", "--no-best-effort", "--quiet",
    ], { windowsHide: true, encoding: "utf8", timeout: 110_000 });
    assert.equal(render.status, 0, `${render.stdout}\n${render.stderr}`);
    const frames = await collectPngs(output);
    assert.equal(frames.length, 40);
    const initial = yellowPixelsByColumns(frames[0]!, width, height, modes.length);
    const final = yellowPixelsByColumns(frames.at(-1)!, width, height, modes.length);
    assert.ok(initial[0]! > 20, `current step painted only ${initial[0]} active pixels at Cue start`);
    assert.ok(initial[1]! < 10, `current wipe unexpectedly painted ${initial[1]} active pixels at Cue start`);
    assert.ok(initial[2]! > 20, `trail step painted only ${initial[2]} active pixels at Cue start`);
    assert.ok(initial[3]! < 10, `trail wipe unexpectedly painted ${initial[3]} active pixels at Cue start`);
    assert.ok(final[0]! > 20 && final[1]! > 20, `current modes lost the final active Atom: ${final}`);
    assert.ok(final[2]! > final[0]! * 2, `trail step did not retain prior Atoms: ${final}`);
    assert.ok(final[3]! > final[1]! * 2, `trail wipe did not retain prior Atoms: ${final}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Fine Caption joined trail Pill follows real wrapped browser line fragments", {
  skip: !enabled || localFont === undefined,
  timeout: 120_000,
}, async () => {
  assert(localFont !== undefined);
  const temp = await mkdtemp(path.join(os.tmpdir(), "hypit-caption-fine-pill-"));
  try {
    const width = 480;
    const height = 280;
    const space = sealProgramSpace({
      durationSec: 6, frameRate: { numerator: 10, denominator: 1 },
    });
    const narrative = parseScript("pill.svml", "<line>Every caption word joins across lines.</line>");
    const display = captionDisplaySequence(narrative, "pill.caption");
    const fontBytes = await import("node:fs/promises").then(({ readFile }) => readFile(localFont));
    const font: FontArtifactRef = {
      sources: [{ artifact: { kind: "blob", digest: digest(fontBytes), size: fontBytes.byteLength, mediaType: "font/ttf" } }],
      weight: 400,
      style: "normal",
    };
    const recipe: SvsRecipe = {

      path: "caption.joined-pill",
      properties: {
        "cue-min-words": 1, "cue-max-words": 8,
        "stack-order": 20, x: 0.5, y: 0.5, width: 0.5,
        "anchor-x": "center", "anchor-y": "center",
        size: 36, "line-height": 1.5,
        align: "left", fill: "#FFFFFF", background: "#00000000", padding: "0 0", radius: 0,
        "word-gap": 8,
        "active-box": "trail", "active-box-continuity": "joined",
        "active-box-background": "#00FF00", "active-box-padding": "3 7", "active-box-radius": 7,
      },
    };
    const style = fineCaptionStyle("joined-pill", recipe, [font]);
    const program = resolveCaptionProgram(display, "joined-pill-program", style, []);
    const projection: TimedCaptionProjection = {
      displaySequenceId: display.id,
      cues: [{
        id: "joined-pill-cue", styleId: style.id,
        startFrame: 0, endFrameExclusive: 60,
        atoms: display.atoms.map((atom, index) => ({ atomId: atom.id, startFrame: index * 10, endFrameExclusive: (index + 1) * 10 })),
        fields: [],
      }],
    };
    const track = renderFineCaption(projection, program, display, space);
    const document = compileHyperframesDocument(sealComposition({
      id: "caption-fine-joined-pill",
      canvas: { width, height, clearColor: "#000000" },
      tracks: [track],
    }), space);
    await copyFile(localFont, path.join(temp, "caption.ttf"));
    await writeFile(path.join(temp, "index.html"), materializeHyperframesHtml(document, (artifact) => {
      if (artifact.digest === font.sources[0]!.artifact.digest) return "./caption.ttf";
      throw new Error(`Unexpected joined-Pill Artifact ${artifact.digest}`);
    }));
    const output = path.join(temp, "frames");
    await mkdir(output);
    const render = spawnSync(process.execPath, [
      hyperframesCli, "render", temp,
      "--format", "png-sequence", "--output", output, "--fps", "10", "--workers", "1",
      "--no-browser-gpu", "--no-best-effort", "--quiet",
    ], { windowsHide: true, encoding: "utf8", timeout: 110_000 });
    assert.equal(render.status, 0, `${render.stdout}\n${render.stderr}`);
    const frames = await collectPngs(output);
    assert.equal(frames.length, 60);
    const rgba = decodedRgba(frames.at(-1)!, width, height);
    const isGreen = (red: number, green: number, blue: number) => green > 170 && red < 100 && blue < 100;
    assert.ok(matchingPixels(rgba, width, { left: 0, top: 0, right: width, bottom: height }, isGreen) > 1_000,
      "joined trail Pill painted too few background pixels");
    assert.ok(longestHorizontalRun(rgba, width, height, isGreen) > 100,
      "joined trail Pill remained separate per-Atom capsules instead of one line fragment");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("installed open fonts render CJK, emoji and independent stroke, shadow and glow Paint", {
  skip: !enabled,
  timeout: 120_000,
}, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "hypit-caption-fine-multilingual-"));
  try {
    const width = 720;
    const height = 320;
    const durationSec = 1 / 30;
    const space = sealProgramSpace({
      durationSec,
      frameRate: { numerator: 30, denominator: 1 },
    });
    const installed = await Promise.all([
      installedOpenFont("inter", 700, "normal"),
      installedOpenFont("noto-sans-sc", 700, "normal"),
      installedOpenFont("noto-color-emoji", 400, "normal"),
    ]);
    const fonts = installed.map(({ font }) => font);
    const fontBytes = new Map<Digest, Uint8Array>();
    for (const face of installed) for (const [artifactDigest, bytes] of face.bytes) fontBytes.set(artifactDigest, bytes);
    const base = {
      "cue-min-words": 1, "cue-max-words": 8,
      "stack-order": 20, width: 0.4,
      "anchor-x": "center", "anchor-y": "center",
      size: 72, "line-height": 1,
      align: "center", fill: "#FFFFFF",
      background: "#00000000", padding: "0 0", radius: 0,
    } as const;
    const makeTrack = (
      id: string,
      text: string,
      properties: Readonly<Record<string, string | number>>,
    ) => {
      const narrative = parseScript(`${id}.svml`, `<line>${text}</line>`);
      const display = captionDisplaySequence(narrative, `${id}.caption`);
      const recipe: SvsRecipe = {

        path: `caption.${id}`,
        properties: { ...base, ...properties },
      };
      const style = fineCaptionStyle(id, recipe, fonts);
      const program = resolveCaptionProgram(display, `${id}-program`, style, []);
      const projection: TimedCaptionProjection = {

        displaySequenceId: display.id,
        cues: [{
          id: `${id}-cue`, styleId: style.id,
          startFrame: 0, endFrameExclusive: 1,
          atoms: display.atoms.map((atom) => ({ atomId: atom.id, startFrame: 0, endFrameExclusive: 1 })),
          fields: [],
        }],
      };
      return renderFineCaption(projection, program, display, space);
    };
    const tracks = [
      makeTrack("cjk", "世界", { x: 0.25, y: 0.28 }),
      makeTrack("emoji", "<🌐 🎤 | globe microphone>", { x: 0.75, y: 0.28 }),
      makeTrack("paint", "SVML", {
        x: 0.5, y: 0.75, width: 0.7, size: 76,
        "stroke-color": "#FF0000", "stroke-width": 3,
        "shadow-color": "#0000FF", "shadow-opacity": 1,
        "shadow-x": 14, "shadow-y": 10, "shadow-blur": 0,
        "glow-color": "#00FF00", "glow-opacity": 1, "glow-blur": 10,
      }),
    ];
    const document = compileHyperframesDocument(sealComposition({
      id: "caption-fine-multilingual",
      canvas: { width, height, clearColor: "#000000" },
      tracks,
    }), space);
    assert.deepEqual(
      new Set(document.artifacts.map((artifact) => artifact.digest)),
      new Set(fonts.flatMap((font) => font.sources.map((source) => source.artifact.digest))),
    );
    const paths = new Map<Digest, string>();
    await Promise.all([...fontBytes].map(async ([artifactDigest, bytes], index) => {
      const name = `font-${index}.woff2`;
      await writeFile(path.join(temp, name), bytes);
      paths.set(artifactDigest, `./${name}`);
    }));
    await writeFile(path.join(temp, "index.html"), materializeHyperframesHtml(document, (artifact) => {
      const materialized = paths.get(artifact.digest);
      if (materialized === undefined) throw new Error(`Unexpected multilingual Artifact ${artifact.digest}`);
      return materialized;
    }));
    const output = path.join(temp, "frames");
    await mkdir(output);
    const render = spawnSync(process.execPath, [
      hyperframesCli, "render", temp,
      "--format", "png-sequence", "--output", output, "--fps", "30", "--workers", "1",
      "--no-browser-gpu", "--no-best-effort", "--quiet",
    ], { windowsHide: true, encoding: "utf8", timeout: 110_000 });
    assert.equal(render.status, 0, `${render.stdout}\n${render.stderr}`);
    const frames = await collectPngs(output);
    assert.equal(frames.length, 1);
    const rgba = decodedRgba(frames[0]!, width, height);
    const visible = (red: number, green: number, blue: number) => red + green + blue > 180;
    assert.ok(matchingPixels(rgba, width, { left: 0, top: 0, right: width / 2, bottom: height / 2 }, visible) > 100,
      "the exact CJK fallback did not paint its glyphs");
    assert.ok(matchingPixels(rgba, width, { left: width / 2, top: 0, right: width, bottom: height / 2 }, visible) > 100,
      "the exact emoji fallback did not paint its glyphs");
    assert.ok(matchingPixels(rgba, width, { left: width / 2, top: 0, right: width, bottom: height / 2 },
      (red, green, blue) => Math.max(red, green, blue) - Math.min(red, green, blue) > 35) > 50,
    "the exact color emoji fallback painted no chromatic pixels");
    const paintRegion = { left: 0, top: height / 2, right: width, bottom: height };
    assert.ok(matchingPixels(rgba, width, paintRegion, (red, green, blue) => red > 150 && green < 120 && blue < 120) > 100,
      "stroke Paint did not produce red pixels");
    assert.ok(matchingPixels(rgba, width, paintRegion, (red, green, blue) => blue > 150 && red < 120 && green < 120) > 100,
      "shadow Paint did not produce blue pixels");
    assert.ok(matchingPixels(rgba, width, paintRegion, (red, green, blue) => green > 50 && red < 120 && blue < 120) > 100,
      "glow Paint did not produce green pixels");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("complete Text flow, Path, local mask and motion stay exact under parallel browser rendering", {
  skip: !enabled,
  timeout: 180_000,
}, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "hypit-text-complete-"));
  try {
    const width = 960;
    const height = 720;
    const fps = 12;
    const frames = 12;
    const space = sealProgramSpace({
      durationSec: 1,
      frameRate: { numerator: fps, denominator: 1 },
    });
    const installed = await Promise.all([
      installedOpenFont("inter", 700, "normal"),
      installedOpenFont("noto-sans-sc", 700, "normal"),
      installedOpenFont("noto-color-emoji", 400, "normal"),
    ]);
    const fonts = installed.map(({ font }) => font);
    const fontBytes = new Map<Digest, Uint8Array>();
    for (const face of installed) for (const [artifactDigest, bytes] of face.bytes) fontBytes.set(artifactDigest, bytes);
    const flow = {
      inlineSize: "fixed" as const, blockSize: "fixed" as const,
      paddingPx: { inlineStart: 8, inlineEnd: 8, blockStart: 6, blockEnd: 6 },
      inlineAlign: "center" as const, blockAlign: "center" as const,
      wrap: "word" as const, overflow: "visible" as const,
      clipToFrame: false, columns: 1, columnGapPx: 0,
      metricEdge: "line-box" as const,
    };
    const baseStyle = (id: string, stackingOrder: number, paints: TextStyle["paints"]): TextStyle => sealTextStyle({
      id, stackingOrder,
      typography: {
        fonts, sizePx: 42, weight: 700, style: "normal", axes: [], features: [],
        synthesis: "none", kerning: "normal", trackingPx: 0, wordSpacingPx: 0,
        lineHeight: 1.1, language: "en", direction: "auto", writingMode: "horizontal-tb",
        baselineShiftPx: 0, tabSize: 4, indentationPx: 0, paragraphBeforePx: 0,
        paragraphAfterPx: 0, transform: "none", variantCaps: "normal", verticalAlign: "baseline",
        decorations: [], cjk: { textSpacing: "normal", punctuationTrim: "none" },
      },
      paints,
      area: flow,
      point: { anchorInline: "center", anchorBlock: "center" },
      path: {
        side: "left", orientation: "upright", startMarginPx: 10, endMarginPx: 10,
        align: "center", reverse: false, overflow: "visible",
      },
    });
    const plain = baseStyle("plain", 20, [{ kind: "fill", paint: { kind: "solid", color: "#ffffff" } }]);
    const decorated = sealTextStyle({
      ...baseStyle("decorated", 30, [
        { kind: "shadow", paint: { kind: "solid", color: "#2563eb" }, offsetX: 8, offsetY: 6, blurPx: 2, spreadPx: 1 },
        { kind: "stroke", paint: { kind: "solid", color: "#ef4444" }, widthPx: 4, placement: "outside" },
        { kind: "fill", paint: { kind: "linear-gradient", angleDeg: 90, stops: [
          { offset: 0, color: "#ffffff", opacity: 1 }, { offset: 1, color: "#67e8f9", opacity: 1 },
        ] } },
        { kind: "stroke", paint: { kind: "solid", color: "#fde047" }, widthPx: 2, placement: "inside" },
        { kind: "shadow", paint: { kind: "solid", color: "#16a34a" }, offsetX: -5, offsetY: 4, blurPx: 0, spreadPx: 0 },
        { kind: "glow", paint: { kind: "solid", color: "#d946ef" }, blurPx: 7, spreadPx: 2 },
        {
          kind: "box", target: "line", continuity: "isolated",
          decoration: {
            fill: { kind: "solid", color: "#111827cc" },
            paddingPx: { top: 3, right: 6, bottom: 3, left: 6 },
            radiiPx: { topLeft: 6, topRight: 6, bottomRight: 6, bottomLeft: 6 }, shadows: [],
          },
        },
      ]),
      typography: {
        ...plain.typography,
        decorations: [{ line: "underline", paint: { kind: "solid", color: "#facc15" }, style: "solid", thicknessPx: 2, offsetPx: 3, skipInk: true }],
      },
    });
    const clip = sealTextStyle({ ...plain, id: "clip", area: { ...flow, overflow: "clip", clipToFrame: true }, typography: { ...plain.typography, sizePx: 52 } });
    const ellipsis = sealTextStyle({ ...plain, id: "ellipsis", area: { ...flow, overflow: "ellipsis", maxLines: 2, clipToFrame: true }, typography: { ...plain.typography, sizePx: 32 } });
    const shrink = sealTextStyle({ ...plain, id: "shrink", area: { ...flow, overflow: "shrink", maxLines: 3, minimumScale: 0.25, clipToFrame: true }, typography: { ...plain.typography, sizePx: 40 } });
    const pathStyle = sealTextStyle({
      ...plain,
      id: "path",
      stackingOrder: 40,
      typography: { ...plain.typography, sizePx: 38 },
      paints: [{ kind: "fill", paint: {
        kind: "radial-gradient", center: { x: 0.35, y: 0.5 }, stops: [
          { offset: 0, color: "#ffffff", opacity: 1 },
          { offset: 1, color: "#22d3ee", opacity: 1 },
        ],
      } }],
      path: { ...plain.path, orientation: "upright", align: "center" },
    });
    const animated = sealTextMotion({
      id: "animated",
      item: { keyframes: [
        { atFrame: 0, style: [{ name: "opacity", value: 0 }, { name: "transform", value: "translateY(25px)" }] },
        { atFrame: 4, easing: "ease-out", style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0px)" }] },
        { atFrame: 8, style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0px)" }] },
        { atFrame: frames, easing: "ease-in", style: [{ name: "opacity", value: 0 }, { name: "transform", value: "translateY(-20px)" }] },
      ] },
      sequences: [{
        id: "reverse-words", unit: "word", range: { start: 0, endExclusive: 3 }, order: "reverse",
        startFrame: 0, unitDurationFrames: 4, staggerFrames: 2, cycles: 1,
        keyframes: [
          { atProgress: 0, style: [{ name: "opacity", value: 0 }, { name: "transform", value: "scale(0.5)" }] },
          { atProgress: 1, easing: "ease-out", style: [{ name: "opacity", value: 1 }, { name: "transform", value: "scale(1)" }] },
        ],
      }],
    });
    const pathMotion = sealTextMotion({
      id: "path-motion", sequences: [],
      pathMargin: { keyframes: [{ atFrame: 0, startMarginPx: 20 }, { atFrame: frames, startMarginPx: 150, easing: "ease-in-out" }] },
    });
    const textProgram = sealTypographyTrackProgram({
      id: "complete-text",
      items: [
        {
          id: "point", span: { startFrame: 0, endFrameExclusive: frames }, tieBreak: "point",
          geometry: { kind: "point", point: { xPx: 160, yPx: 56 } },
          document: { paragraphs: [{ id: "point-p", inlines: [{ kind: "text", id: "point-r", text: "POINT" }] }] }, style: plain, motion: stillTextMotion(),
        },
        {
          id: "multilingual", span: { startFrame: 0, endFrameExclusive: frames }, tieBreak: "multilingual",
          geometry: { kind: "area", frame: { xPx: 20, yPx: 100, widthPx: 300, heightPx: 180 } },
          document: { paragraphs: [{ id: "multi-p", inlines: [
            { kind: "text", id: "latin", text: "Intent " },
            { kind: "text", id: "cjk", text: "可见", language: "zh-Hans" },
            { kind: "break", id: "multi-break" },
            { kind: "text", id: "rtl", text: "مرحبا", language: "ar", direction: "rtl" },
            { kind: "text", id: "emoji", text: " 👩🏽‍💻 e\u0301" },
          ] }] }, style: decorated, motion: stillTextMotion(),
        },
        {
          id: "clip", span: { startFrame: 0, endFrameExclusive: frames }, tieBreak: "clip",
          geometry: { kind: "area", frame: { xPx: 345, yPx: 100, widthPx: 170, heightPx: 80 } },
          document: { paragraphs: [{ id: "clip-p", inlines: [{ kind: "text", id: "clip-r", text: "CLIPPED CONTENT MUST STAY INSIDE" }] }] }, style: clip, motion: stillTextMotion(),
        },
        {
          id: "ellipsis", span: { startFrame: 0, endFrameExclusive: frames }, tieBreak: "ellipsis",
          geometry: { kind: "area", frame: { xPx: 535, yPx: 100, widthPx: 170, heightPx: 80 } },
          document: { paragraphs: [{ id: "ellipsis-p", inlines: [{ kind: "text", id: "ellipsis-r", text: "ELLIPSIS KEEPS A BOUNDED TWO LINE REGION" }] }] }, style: ellipsis, motion: stillTextMotion(),
        },
        {
          id: "shrink", span: { startFrame: 0, endFrameExclusive: frames }, tieBreak: "shrink",
          geometry: { kind: "area", frame: { xPx: 725, yPx: 100, widthPx: 215, heightPx: 100 } },
          document: { paragraphs: [{ id: "shrink-p", inlines: [{ kind: "text", id: "shrink-r", text: "SHRINK PRESERVES EVERY AUTHORED WORD INSIDE ITS BOUND" }] }] }, style: shrink, motion: stillTextMotion(),
        },
        {
          id: "sequence", span: { startFrame: 0, endFrameExclusive: frames }, tieBreak: "sequence",
          geometry: { kind: "area", frame: { xPx: 120, yPx: 490, widthPx: 360, heightPx: 100 } },
          document: { paragraphs: [{ id: "sequence-p", inlines: [{ kind: "text", id: "sequence-r", text: "ONE TWO THREE" }] }] }, style: plain, motion: animated,
        },
        {
          id: "path", span: { startFrame: 0, endFrameExclusive: frames }, tieBreak: "path",
          geometry: { kind: "path", path: { commands: [
            { kind: "move", xPx: 80, yPx: 390 }, { kind: "cubic", control1X: 300, control1Y: 290, control2X: 650, control2Y: 470, xPx: 900, yPx: 350 },
          ] } },
          document: { paragraphs: [{ id: "path-p", inlines: [{ kind: "text", id: "path-r", text: "UPRIGHT PATH TEXT" }] }] }, style: pathStyle, motion: pathMotion,
        },
      ],
    });
    const typographyTrack = renderTypographyTrack(space, textProgram);
    const maskMaterialBytes = rgbaPng(380, 120, [255, 0, 180, 255]);
    const maskMaterialDigest = digest(maskMaterialBytes);
    const maskMaterial: CompositableSurfaceRef = {
      artifact: { kind: "blob", digest: maskMaterialDigest, size: maskMaterialBytes.byteLength, mediaType: "image/png" },
      width: 380, height: 120, colorSpace: "srgb", alphaMode: "straight", timing: { kind: "still" },
    };
    const maskStyle = sealTextStyle({
      ...plain,
      id: "mask-style",
      stackingOrder: 50,
      typography: { ...plain.typography, sizePx: 100, lineHeight: 1 },
      paints: [{ kind: "fill", paint: { kind: "solid", color: "#ffffff" } }],
      area: { ...plain.area, wrap: "none" },
    });
    const maskTrack = renderTextMaskTrack(space, sealTypographyTrackProgram({
      id: "mask-shape",
      items: [{
        id: "mask", span: { startFrame: 0, endFrameExclusive: frames }, tieBreak: "mask",
        geometry: { kind: "area", frame: { xPx: 520, yPx: 500, widthPx: 380, heightPx: 120 } },
        document: { paragraphs: [{ id: "mask-p", inlines: [{ kind: "text", id: "mask-r", text: "MASK" }] }] },
        style: maskStyle, motion: stillTextMotion(),
      }],
    }), maskMaterial, sealTextMaskSpec({
      id: "text-mask", mode: "alpha", materialFit: "cover",
    }));
    const document = compileHyperframesDocument(sealComposition({
      id: "complete-text-browser",
      canvas: { width, height, clearColor: "#000000" }, tracks: [typographyTrack, maskTrack],
    }), space);
    assert.match(document.html, /data-hypit-text-shrink-scale/u);
    assert.match(document.html, /data-hypit-text-path-upright/u);
    assert.match(document.html, /mask-type:alpha/u);
    const paths = new Map<Digest, string>();
    await Promise.all([...fontBytes].map(async ([artifactDigest, bytes], index) => {
      const name = `font-${index}.woff2`;
      await writeFile(path.join(temp, name), bytes);
      paths.set(artifactDigest, `./${name}`);
    }));
    await writeFile(path.join(temp, "mask-material.png"), maskMaterialBytes);
    paths.set(maskMaterialDigest, "./mask-material.png");
    await writeFile(path.join(temp, "index.html"), materializeHyperframesHtml(document, (artifact) => {
      const materialized = paths.get(artifact.digest);
      if (materialized === undefined) throw new Error(`Unexpected complete-Text Artifact ${artifact.digest}`);
      return materialized;
    }));
    const render = async (workers: number, directory: string): Promise<string[]> => {
      const output = path.join(temp, directory);
      await mkdir(output);
      const result = spawnSync(process.execPath, [
        hyperframesCli, "render", temp,
        "--format", "png-sequence", "--output", output, "--fps", String(fps), "--workers", String(workers),
        "--no-browser-gpu", "--no-best-effort", "--quiet",
      ], { windowsHide: true, encoding: "utf8", timeout: 170_000 });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return await collectPngs(output);
    };
    const sequential = await render(1, "sequential");
    const parallel = await render(3, "parallel");
    assert.equal(sequential.length, frames);
    assert.equal(parallel.length, frames);
    const read = await import("node:fs/promises").then(({ readFile }) => readFile);
    assert.deepEqual(
      await Promise.all(sequential.map(async (file) => digest(await read(file)))),
      await Promise.all(parallel.map(async (file) => digest(await read(file)))),
      "complete Text changed under partitioned/out-of-order rendering",
    );
    const first = decodedRgba(sequential[0]!, width, height);
    const middle = decodedRgba(sequential[6]!, width, height);
    const last = decodedRgba(sequential.at(-1)!, width, height);
    assert.ok(matchingPixels(middle, width, { left: 0, top: 90, right: 330, bottom: 290 }, (r, g, b) => r + g + b > 220) > 500,
      "multilingual rich Text did not paint");
    assert.ok(matchingPixels(middle, width, { left: 0, top: 90, right: 330, bottom: 290 }, (r, g, b) => r > 150 && g < 130 && b < 130) > 50,
      "outside stroke layer did not paint red");
    assert.ok(matchingPixels(middle, width, { left: 0, top: 90, right: 330, bottom: 290 }, (r, g, b) => b > 130 && r < 150) > 50,
      "shadow layer did not paint blue");
    assert.ok(matchingPixels(middle, width, { left: 60, top: 285, right: 920, bottom: 470 }, (r, g, b) => r + g + b > 180) > 150,
      "Path Text did not paint on its owned path");
    assert.ok(matchingPixels(middle, width, { left: 60, top: 285, right: 920, bottom: 470 }, (r, g, b) => b > 150 && g > 100 && r < 180) > 30,
      "Path Text radial gradient did not paint its cyan edge");
    const pathRegion = { left: 60, top: 285, right: 920, bottom: 470 };
    const pathInk = (rgba: Buffer) => matchingBounds(rgba, width, pathRegion, (r, g, b) => r > 180 && g > 180 && b > 180);
    const firstPath = pathInk(first);
    const lastPath = pathInk(last);
    assert(firstPath !== undefined && lastPath !== undefined);
    assert.ok(lastPath.left > firstPath.left + 35,
      `animated Path Text did not honor its changing start margin: ${JSON.stringify({ firstPath, lastPath })}`);
    const maskPixels = matchingPixels(middle, width, { left: 520, top: 500, right: 900, bottom: 620 }, (r, _g, b) => r > 100 || b > 100);
    assert.ok(maskPixels > 1_000, `explicit local Text Mask revealed only ${maskPixels} owned-material pixels`);
    const sequenceRegion = { left: 110, top: 480, right: 490, bottom: 600 };
    const visible = (rgba: Buffer) => matchingPixels(rgba, width, sequenceRegion, (r, g, b) => r + g + b > 400);
    const sequenceCounts = { first: visible(first), middle: visible(middle), last: visible(last) };
    assert.ok(sequenceCounts.middle > sequenceCounts.first, `item/word sequence did not enter: ${JSON.stringify(sequenceCounts)}`);
    assert.ok(sequenceCounts.middle > sequenceCounts.last, `item motion did not exit: ${JSON.stringify(sequenceCounts)}`);
    const outsideClip = { left: 345, top: 180, right: 515, bottom: 240 };
    assert.equal(matchingPixels(middle, width, outsideClip, (r, g, b) => r + g + b > 50), 0,
      "clip Text painted outside its authored frame");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Text box targets, rich runs and every sequence direction remain stable across workers", {
  skip: !enabled,
  timeout: 180_000,
}, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "hypit-text-box-sequence-"));
  try {
    const width = 960;
    const height = 440;
    const fps = 12;
    const frames = 12;
    const space = sealProgramSpace({
      durationSec: 1,
      frameRate: { numerator: fps, denominator: 1 },
    });
    const installed = await installedOpenFont("inter", 700, "normal");
    const fonts = [installed.font];
    const flow = {
      inlineSize: "fixed" as const, blockSize: "fixed" as const,
      paddingPx: { inlineStart: 8, inlineEnd: 8, blockStart: 6, blockEnd: 6 },
      inlineAlign: "center" as const, blockAlign: "center" as const,
      wrap: "word" as const, overflow: "visible" as const,
      clipToFrame: false, columns: 1, columnGapPx: 0, metricEdge: "line-box" as const,
    };
    const box = (
      target: "frame" | "content" | "paragraph" | "line" | "run" | "word" | "grapheme",
      continuity: "isolated" | "joined",
      color: string,
    ): TextStyle["paints"][number] => ({
      kind: "box", target, continuity,
      decoration: {
        fill: { kind: "solid", color },
        paddingPx: { top: 3, right: 5, bottom: 3, left: 5 },
        radiiPx: { topLeft: 5, topRight: 5, bottomRight: 5, bottomLeft: 5 },
        shadows: [],
      },
    });
    const style = (
      id: string,
      stackingOrder: number,
      target: "frame" | "content" | "line" | "word" | "grapheme",
      continuity: "isolated" | "joined",
      color: string,
    ): TextStyle => sealTextStyle({
      id, stackingOrder,
      typography: {
        fonts, sizePx: 34, weight: 700, style: "normal", axes: [], features: [],
        synthesis: "none", kerning: "normal", trackingPx: 0, wordSpacingPx: 0,
        lineHeight: 1.05, language: "en", direction: "auto", writingMode: "horizontal-tb",
        baselineShiftPx: 0, tabSize: 4, indentationPx: 0, paragraphBeforePx: 0,
        paragraphAfterPx: 0, transform: "none", variantCaps: "normal", verticalAlign: "baseline",
        decorations: [], cjk: { textSpacing: "normal", punctuationTrim: "none" },
      },
      paints: [
        { kind: "fill", paint: { kind: "solid", color: "#ffffff" } },
        box(target, continuity, color),
        ...(id === "forward-grapheme" ? [box("paragraph", "isolated", "#312e81")] : []),
      ],
      area: flow,
      point: { anchorInline: "center", anchorBlock: "center" },
      path: {
        side: "left", orientation: "follow", startMarginPx: 0, endMarginPx: 0,
        align: "start", reverse: false, overflow: "visible",
      },
    });
    const cases = [
      { id: "forward-grapheme", unit: "grapheme", order: "forward", target: "frame", continuity: "isolated", color: "#7f1d1d" },
      { id: "reverse-grapheme", unit: "grapheme", order: "reverse", target: "content", continuity: "isolated", color: "#166534" },
      { id: "forward-word", unit: "word", order: "forward", target: "line", continuity: "isolated", color: "#854d0e" },
      { id: "reverse-word", unit: "word", order: "reverse", target: "word", continuity: "isolated", color: "#1d4ed8" },
      { id: "forward-line", unit: "line", order: "forward", target: "word", continuity: "joined", color: "#0f766e" },
      { id: "reverse-line", unit: "line", order: "reverse", target: "grapheme", continuity: "isolated", color: "#a16207" },
    ] as const;
    const track = renderTypographyTrack(space, sealTypographyTrackProgram({
      id: "text-box-sequence",
      items: cases.map((entry, index) => {
        const lineUnit = entry.unit === "line";
        const document = index === 1
          ? { paragraphs: [{ id: `${entry.id}-p`, inlines: [
            { kind: "text" as const, id: `${entry.id}-base`, text: "NESTED " },
            {
              kind: "text" as const, id: `${entry.id}-run`, text: "RUN STYLE WRAPS",
              style: {
                typography: { sizePx: 25 },
                paints: [
                  { kind: "fill" as const, paint: { kind: "solid" as const, color: "#f9a8d4" } },
                  {
                    kind: "box" as const, target: "run" as const, continuity: "isolated" as const,
                    decoration: {
                      fill: { kind: "solid" as const, color: "#4c1d95" },
                      paddingPx: { top: 2, right: 3, bottom: 2, left: 3 },
                      radiiPx: { topLeft: 3, topRight: 3, bottomRight: 3, bottomLeft: 3 }, shadows: [],
                    },
                  },
                ],
              },
            },
          ] }] }
          : { paragraphs: [{ id: `${entry.id}-p`, inlines: [
            { kind: "text" as const, id: `${entry.id}-a`, text: "ALPHA BETA" },
            ...(lineUnit ? [{ kind: "break" as const, id: `${entry.id}-break` }, { kind: "text" as const, id: `${entry.id}-b`, text: "GAMMA" }] : []),
          ] }] };
        return {
          id: entry.id, span: { startFrame: 0, endFrameExclusive: frames }, tieBreak: entry.id,
          geometry: {
            kind: "area" as const,
            frame: {
              xPx: 10 + (index % 3) * 315, yPx: 10 + Math.floor(index / 3) * 215,
              widthPx: 305, heightPx: 205,
            },
          },
          document,
          style: style(entry.id, 10 + index, entry.target, entry.continuity, entry.color),
          motion: sealTextMotion({
            id: `${entry.id}-motion`,
            sequences: [{
              id: `${entry.id}-sequence`, unit: entry.unit,
              range: { start: 0, endExclusive: lineUnit ? 2 : entry.unit === "word" ? 2 : 5 },
              order: entry.order, startFrame: 0, unitDurationFrames: 4, staggerFrames: 1,
              cycles: index === 0 ? 2 : 1,
              keyframes: [
                { atProgress: 0, style: [{ name: "opacity", value: 0 }, { name: "transform", value: "translateY(7px)" }] },
                { atProgress: 1, easing: "ease-out", style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0px)" }] },
              ],
            }],
          }),
        };
      }),
    }));
    const compiled = compileHyperframesDocument(sealComposition({
      id: "text-box-sequence-browser",
      canvas: { width, height, clearColor: "#000000" }, tracks: [track],
    }), space);
    assert.match(compiled.html, /data-hypit-text-line-sequences/u);
    assert.match(compiled.html, /background-image:linear-gradient\(#312e81,#312e81\)/u);
    assert.match(compiled.html, /order&quot;:&quot;forward/u);
    assert.match(compiled.html, /order&quot;:&quot;reverse/u);
    assert.match(compiled.html, /data-hypit-text-run="reverse-grapheme-run"/u);
    const paths = new Map<Digest, string>();
    let fontIndex = 0;
    for (const [artifactDigest, bytes] of installed.bytes) {
      const name = `font-${fontIndex++}.woff2`;
      await writeFile(path.join(temp, name), bytes);
      paths.set(artifactDigest, `./${name}`);
    }
    await writeFile(path.join(temp, "index.html"), materializeHyperframesHtml(compiled, (artifact) => {
      const materialized = paths.get(artifact.digest);
      if (materialized === undefined) throw new Error(`Unexpected Text box Artifact ${artifact.digest}`);
      return materialized;
    }));
    const render = async (workers: number, name: string): Promise<string[]> => {
      const output = path.join(temp, name);
      await mkdir(output);
      const result = spawnSync(process.execPath, [
        hyperframesCli, "render", temp,
        "--format", "png-sequence", "--output", output, "--fps", String(fps), "--workers", String(workers),
        "--no-browser-gpu", "--no-best-effort", "--quiet",
      ], { windowsHide: true, encoding: "utf8", timeout: 170_000 });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return collectPngs(output);
    };
    const sequential = await render(1, "sequential");
    const parallel = await render(3, "parallel");
    const partitionDifferences = sequential.map((file, index) => rgbaDifference(
      decodedRgba(file, width, height),
      decodedRgba(parallel[index]!, width, height),
    ));
    // Chromium may raster the same identity-transformed antialiased glyph edge
    // through two equivalent compositor paths in separate browser processes.
    // The exact partition witness above deliberately avoids that path. This
    // complete Box/selector matrix instead permits only a microscopic edge
    // delta while still rejecting any changed layout, unit state or region.
    assert.ok(partitionDifferences.every((difference) => difference.pixels <= 64 && difference.total <= 3_000),
      `Text Box/sequence output changed under partitioned rendering: ${JSON.stringify(partitionDifferences)}`);
    const first = decodedRgba(sequential[0]!, width, height);
    const middle = decodedRgba(sequential[8]!, width, height);
    const last = decodedRgba(sequential.at(-1)!, width, height);
    const visible = (rgba: Buffer) => matchingPixels(rgba, width, { left: 0, top: 0, right: width, bottom: height }, (r, g, b) => r + g + b > 160);
    const visibility = { first: visible(first), middle: visible(middle), last: visible(last) };
    assert.ok(visibility.middle > visibility.first,
      `Text sequence enter and loop states did not become visible: ${JSON.stringify(visibility)}`);
    assert.ok(visibility.last > visibility.first,
      `Text sequence completion did not retain its final state: ${JSON.stringify(visibility)}`);
    assert.ok(matchingPixels(middle, width, { left: 0, top: 0, right: width, bottom: height }, (r, g, b) => b > 100 && r < 100) > 250,
      "isolated word Box Paint did not paint");
    assert.ok(matchingPixels(middle, width, { left: 0, top: 0, right: width, bottom: height }, (r, g, b) => g > 70 && r < 100) > 500,
      "content/joined word Box Paint did not paint");
    assert.ok(matchingPixels(middle, width, { left: 0, top: 0, right: width, bottom: height }, (r, g, b) => r > 120 && g > 70 && b < 80) > 150,
      "line/grapheme Box Paint did not paint");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("vertical Text paints in its authored direction and bounded shrink fails closed", {
  skip: !enabled,
  timeout: 120_000,
}, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "hypit-text-vertical-shrink-"));
  try {
    const width = 320;
    const height = 320;
    const fps = 12;
    const space = sealProgramSpace({
      durationSec: 1 / fps,
      frameRate: { numerator: fps, denominator: 1 },
    });
    const installed = await installedOpenFont("noto-sans-sc", 700, "normal");
    const font = installed.font;
    const paths = new Map<Digest, string>();
    let fontIndex = 0;
    for (const [artifactDigest, bytes] of installed.bytes) {
      const name = `font-${fontIndex++}.woff2`;
      await writeFile(path.join(temp, name), bytes);
      paths.set(artifactDigest, `./${name}`);
    }
    const style = (id: string, writingMode: "horizontal-tb" | "vertical-rl", overflow: "visible" | "shrink", minimumScale?: number): TextStyle => sealTextStyle({
      id, stackingOrder: 10,
      typography: {
        fonts: [font], sizePx: 56, weight: 700, style: "normal", axes: [], features: [],
        synthesis: "none", kerning: "normal", trackingPx: 0, wordSpacingPx: 0,
        lineHeight: 1, language: "zh-Hans", direction: "auto", writingMode,
        baselineShiftPx: 0, tabSize: 4, indentationPx: 0, paragraphBeforePx: 0,
        paragraphAfterPx: 0, transform: "none", variantCaps: "normal", verticalAlign: "baseline",
        decorations: [], cjk: { textSpacing: "normal", punctuationTrim: "none" },
      },
      paints: [{ kind: "fill", paint: { kind: "solid", color: "#ffffff" } }],
      area: {
        inlineSize: "fixed", blockSize: "fixed",
        paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
        inlineAlign: "center", blockAlign: "center", wrap: "word", overflow,
        ...(minimumScale === undefined ? {} : { maxLines: 1, minimumScale }),
        clipToFrame: true, columns: 1, columnGapPx: 0, metricEdge: "line-box",
      },
      point: { anchorInline: "center", anchorBlock: "center" },
      path: { side: "left", orientation: "follow", startMarginPx: 0, endMarginPx: 0, align: "start", reverse: false, overflow: "visible" },
    });
    const compile = (id: string, text: string, frame: { xPx: number; yPx: number; widthPx: number; heightPx: number }, textStyle: TextStyle) => compileHyperframesDocument(sealComposition({
      id,
      canvas: { width, height, clearColor: "#000000" },
      tracks: [renderTypographyTrack(space, sealTypographyTrackProgram({
        id,
        items: [{
          id, span: { startFrame: 0, endFrameExclusive: 1 }, tieBreak: id,
          geometry: { kind: "area", frame: { ...frame } },
          document: { paragraphs: [{ id: `${id}-p`, inlines: [{ kind: "text", id: `${id}-r`, text }] }] },
          style: textStyle, motion: stillTextMotion(),
        }],
      }))],
    }), space);
    const materialize = (document: ReturnType<typeof compileHyperframesDocument>) => materializeHyperframesHtml(document, (artifact) => {
      const materialized = paths.get(artifact.digest);
      if (materialized === undefined) throw new Error(`Unexpected vertical Text Artifact ${artifact.digest}`);
      return materialized;
    });

    await writeFile(path.join(temp, "index.html"), materialize(compile(
      "vertical", "垂直文字AB", { xPx: 20, yPx: 20, widthPx: 280, heightPx: 280 },
      style("vertical-style", "vertical-rl", "visible"),
    )));
    const verticalOutput = path.join(temp, "vertical-output");
    await mkdir(verticalOutput);
    const verticalResult = spawnSync(process.execPath, [
      hyperframesCli, "render", temp,
      "--format", "png-sequence", "--output", verticalOutput, "--fps", String(fps), "--workers", "1",
      "--no-browser-gpu", "--no-best-effort", "--quiet",
    ], { windowsHide: true, encoding: "utf8", timeout: 100_000 });
    assert.equal(verticalResult.status, 0, `${verticalResult.stdout}\n${verticalResult.stderr}`);
    const verticalFrames = await collectPngs(verticalOutput);
    assert.equal(verticalFrames.length, 1);
    const verticalRgba = decodedRgba(verticalFrames[0]!, width, height);
    const bounds = matchingBounds(verticalRgba, width, { left: 0, top: 0, right: width, bottom: height }, (r, g, b) => r + g + b > 300);
    assert(bounds !== undefined);
    assert.ok(bounds.bottom - bounds.top > (bounds.right - bounds.left) * 1.8,
      `vertical writing did not produce a vertical ink column: ${JSON.stringify(bounds)}`);

    await writeFile(path.join(temp, "index.html"), materialize(compile(
      "impossible-shrink", "THIS AUTHORED TEXT CANNOT FIT", { xPx: 120, yPx: 140, widthPx: 80, heightPx: 30 },
      style("impossible-shrink-style", "horizontal-tb", "shrink", 0.9),
    )));
    const shrinkOutput = path.join(temp, "shrink-output");
    await mkdir(shrinkOutput);
    const shrinkResult = spawnSync(process.execPath, [
      hyperframesCli, "render", temp,
      "--format", "png-sequence", "--output", shrinkOutput, "--fps", String(fps), "--workers", "1",
      "--no-browser-gpu", "--no-best-effort", "--quiet",
    ], { windowsHide: true, encoding: "utf8", timeout: 100_000 });
    assert.notEqual(shrinkResult.status, 0, "bounded Text shrink silently rendered below its authored minimum");
    assert.match(`${shrinkResult.stdout}\n${shrinkResult.stderr}`, /Text cannot fit at its authored minimum scale/u);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Media two-frame sampling, alpha, local motion and handoff survive partitioned browser rendering", {
  skip: !enabled,
  timeout: 120_000,
}, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "hypit-media-track-visual-"));
  try {
    const width = 160;
    const height = 120;
    const redBytes = rgbaPng(80, 120, [245, 35, 35, 255]);
    const greenBytes = rgbaPng(80, 120, [20, 235, 80, 255]);
    const alphaBytes = rgbaPng(64, 64, [35, 70, 255, 176]);
    const red: BlobRef = { kind: "blob", digest: digest(redBytes), size: redBytes.byteLength, mediaType: "image/png" };
    const green: BlobRef = { kind: "blob", digest: digest(greenBytes), size: greenBytes.byteLength, mediaType: "image/png" };
    const alpha: CompositableSurfaceRef = {
      artifact: { kind: "blob", digest: digest(alphaBytes), size: alphaBytes.byteLength, mediaType: "image/png" },
      width: 64,
      height: 64,
      colorSpace: "srgb",
      alphaMode: "straight",
      timing: { kind: "still" },
    };
    const paths = new Map<Digest, string>();
    for (const [name, bytes, artifactDigest] of [
      ["red.png", redBytes, red.digest],
      ["green.png", greenBytes, green.digest],
      ["alpha.png", alphaBytes, alpha.artifact.digest],
    ] as const) {
      await writeFile(path.join(temp, name), bytes);
      paths.set(artifactDigest, `./${name}`);
    }
    const canvas = sealCanvasSpace({
      widthPx: width, heightPx: height,
      origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square",
    });
    const space = sealProgramSpace({
      durationSec: 1, frameRate: { numerator: 12, denominator: 1 },
    });
    const semantic = semanticTrackFixture(space);
    const header = mediaTrack.sealMediaTrackHeader({ id: "browser-media" });
    const sampleAppearance = { opacity: 1, filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 } };
    const contentFit = (sizing: "contain" | "cover") => ({
      sizing,
      framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.5, y: 0.5 },
      offsetPx: { x: 0, y: 0 }, constraint: "bounded" as const,
    });
    const extent = { widthPx: 80, heightPx: 120 };
    let itemLayers = mediaTrack.createMediaLayerSet();
    itemLayers = mediaTrack.appendStillMediaLayer(itemLayers, red, extent, contentFit("cover"), mediaTrack.sealMediaSampleLayerSpec({
      id: "blurred-backdrop",
      appearance: { opacity: 1, filter: { blurPx: 6, brightness: 0.8, contrast: 1, saturation: 1 } },
    }));
    itemLayers = mediaTrack.appendSurfaceMediaLayer(itemLayers, alpha, contentFit("contain"), mediaTrack.sealMediaSampleLayerSpec({
      id: "alpha-foreground", appearance: sampleAppearance,
      samplingMotion: { keyframes: [
        { atProgress: 0, zoom: 0.9, offsetX: 0, offsetY: 5, rotationDeg: -2 },
        { atProgress: 1, zoom: 1.05, offsetX: 0, offsetY: -3, rotationDeg: 2, easing: "ease-in-out" },
      ] },
    }));
    let set = mediaTrack.appendProgramMediaItem(
      mediaTrack.createMediaTrackSet(), header, semantic, canvas, itemLayers,
      { xPx: 0, yPx: 0, widthPx: 80, heightPx: 120 },
      mediaTrack.sealMediaItemSpec({
        id: "two-frame",
        projection: { start: { ref: "program.start" }, end: { ref: "program.end" } }, expansion: { kind: "one" },
        presentation: { clip: { kind: "frame" }, padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 }, shadows: [] },
        motion: {
          enter: { operator: "fade", durationFrames: 2, easing: "ease-out" },
          sustain: [{ operator: "breathe", amount: 0.04, cycles: 1 }],
          exit: { operator: "fade", durationFrames: 2, easing: "ease-in" },
        },
        stackingOrder: 10,
      }),
      mediaTrack.createMediaSoundSet(),
    );
    const stillLayers = (id: string, artifact: BlobRef) => mediaTrack.appendStillMediaLayer(
      mediaTrack.createMediaLayerSet(), artifact, extent, contentFit("cover"), mediaTrack.sealMediaSampleLayerSpec({
        id, appearance: sampleAppearance,
      }),
    );
    let members = mediaTrack.createMediaSequenceMemberSet();
    members = mediaTrack.appendMediaSequenceMember(members, stillLayers("red-member", red),
      mediaTrack.sealMediaSequenceMemberSpec({ id: "red" }), 0);
    members = mediaTrack.appendMediaSequenceMember(members, stillLayers("green-member", green),
      mediaTrack.sealMediaSequenceMemberSpec({ id: "green" }), 6);
    set = mediaTrack.appendMediaSequence(
      set, header, space, canvas, members,
      { xPx: 80, yPx: 0, widthPx: 80, heightPx: 120 },
      mediaTrack.sealMediaSequenceSpec({
        id: "handoff",
        presentation: { clip: { kind: "frame" }, padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 }, shadows: [] },
        motion: { sustain: [] }, stackingOrder: 20,
        handoffs: [mediaTrack.sealMediaHandoffSpec({
          id: "red-green", fromMemberId: "red", toMemberId: "green",
          operator: "crossfade", durationFrames: 4, boundaryRatio: 0.5, audio: "cut",
        })],
      }),
      mediaTrack.createMediaSoundSet(), 12,
    );
    const track = mediaTrack.projectMediaVisualTrack(space, mediaTrack.finalizeMediaTrack(set, header, space));
    const document = compileHyperframesDocument(sealComposition({
      id: "media-browser-proof",
      canvas: { width, height, clearColor: "#000000" }, tracks: [track],
    }), space);
    await writeFile(path.join(temp, "index.html"), materializeHyperframesHtml(document, (artifact) => {
      const materialized = paths.get(artifact.digest);
      if (materialized === undefined) throw new Error(`Unexpected Media Artifact ${artifact.digest}`);
      return materialized;
    }));
    const render = async (workers: number, name: string): Promise<Buffer[]> => {
      const output = path.join(temp, name);
      await mkdir(output);
      const result = spawnSync(process.execPath, [
        hyperframesCli, "render", temp,
        "--format", "png-sequence", "--output", output, "--fps", "12", "--workers", String(workers),
        "--no-browser-gpu", "--no-best-effort", "--quiet",
      ], { windowsHide: true, encoding: "utf8", timeout: 110_000 });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return Promise.all((await collectPngs(output)).map(async (file) => decodedRgba(file, width, height)));
    };
    const sequential = await render(2, "sequential");
    const partitioned = await render(3, "partitioned");
    assert.equal(sequential.length, 12);
    assert.equal(partitioned.length, 12);
    for (let frameIndex = 0; frameIndex < sequential.length; frameIndex += 1) {
      assert.deepEqual(partitioned[frameIndex], sequential[frameIndex], `Media frame ${frameIndex} changed under partitioning`);
    }
    assert.notDeepEqual(sequential[1], sequential[10], "Media lifecycle and handoff painted no temporal change");
    assert.ok(matchingPixels(sequential[6]!, width, { left: 0, top: 0, right: 80, bottom: 120 },
      (redValue, _greenValue, blueValue) => redValue > 50 && blueValue > 80) > 400,
    "the straight-alpha foreground did not composite over its explicit backdrop");
    assert.ok(matchingPixels(sequential[10]!, width, { left: 80, top: 0, right: 160, bottom: 120 },
      (_redValue, greenValue) => greenValue > 150) > 4_000,
    "the Sequence handoff never reached the incoming material");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("DepthStack Deck reflow, exact labels and old-system layout survive partitioned browser rendering", {
  skip: !enabled,
  timeout: 120_000,
}, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "hypit-depth-stack-visual-"));
  try {
    const width = 240;
    const height = 180;
    const fps = 12;
    const frames = 18;
    const installed = await installedOpenFont("inter", 700, "normal");
    const font = installed.font;
    const colors = [
      { id: "claim", rgba: [240, 45, 55, 255] as const },
      { id: "proof", rgba: [25, 220, 85, 255] as const },
      { id: "result", rgba: [35, 90, 245, 255] as const },
    ];
    const paths = new Map<Digest, string>();
    const artifacts = colors.map(({ id, rgba }) => {
      const bytes = rgbaPng(120, 90, rgba);
      const artifact: BlobRef = {
        kind: "blob", digest: digest(bytes), size: bytes.byteLength, mediaType: "image/png",
      };
      paths.set(artifact.digest, `./${id}.png`);
      return { id, bytes, artifact };
    });
    for (const value of artifacts) await writeFile(path.join(temp, `${value.id}.png`), value.bytes);
    let fontIndex = 0;
    for (const [artifactDigest, bytes] of installed.bytes) {
      const name = `font-${fontIndex++}.woff2`;
      await writeFile(path.join(temp, name), bytes);
      paths.set(artifactDigest, `./${name}`);
    }
    const space = sealProgramSpace({
      durationSec: frames / fps,
      frameRate: { numerator: fps, denominator: 1 },
    });
    const semantic = semanticTrackFixture(space);
    const canvas = sealCanvasSpace({
      widthPx: width, heightPx: height,
      origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square",
    });
    const fit = {
      sizing: "cover" as const,
      framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.5, y: 0.5 },
      offsetPx: { x: 0, y: 0 }, constraint: "bounded" as const,
    };
    const label = (id: string): DepthStackCardLabel => deckTrack.sealDepthStackCardLabel({
      kind: "text",
      document: { paragraphs: [{ id: `${id}-p`, inlines: [{ id: `${id}-text`, kind: "text", text: id.toUpperCase() }] }] },
      typography: {
        fonts: [font], sizePx: 16, weight: 700, style: "normal", axes: [], features: [], synthesis: "none",
        kerning: "normal", trackingPx: 0, wordSpacingPx: 0, lineHeight: 1.1, direction: "auto",
        writingMode: "horizontal-tb", baselineShiftPx: 0, tabSize: 4, indentationPx: 0,
        paragraphBeforePx: 0, paragraphAfterPx: 0, transform: "none", variantCaps: "normal",
        verticalAlign: "baseline", decorations: [], cjk: { textSpacing: "normal", punctuationTrim: "none" },
      },
      paints: [
        {
          kind: "shadow", paint: { kind: "solid", color: "#000000cc" },
          offsetX: 0, offsetY: 1, blurPx: 2, spreadPx: 0,
        },
        { kind: "fill", paint: { kind: "solid", color: "#ffffff" } },
      ],
      flow: {
        form: { kind: "area" }, inlineSize: "fixed", blockSize: "fixed",
        paddingPx: { inlineStart: 8, inlineEnd: 8, blockStart: 8, blockEnd: 8 },
        inlineAlign: "center", blockAlign: "end", wrap: "none", overflow: "clip",
        clipToFrame: true, columns: 1, columnGapPx: 0, metricEdge: "line-box",
      },
    });
    let cards = deckTrack.createDepthStackCardSet();
    for (const [index, value] of artifacts.entries()) {
      let material = mediaTrack.createMediaLayerSet();
      material = mediaTrack.appendStillMediaLayer(
        material,
        value.artifact,
        { widthPx: 120, heightPx: 90 },
        fit,
        mediaTrack.sealMediaSampleLayerSpec({
          id: `${value.id}-material`,
          appearance: { opacity: 1, filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 } },
        }),
      );
      cards = deckTrack.appendDepthStackCard(
        cards,
        material,
        label(value.id),
        deckTrack.sealDepthStackCardSpec({
          id: value.id,
          playback: { future: "hold-head", past: "hold-tail" },
        }),
        index * 6,
      );
    }
    const spec = deckTrack.sealDepthStackSpec({

      visibility: { previous: 1, next: 1, wrap: false },
      poses: {
        current: {
          xPx: 0, yPx: 0, scale: 1, rotationDeg: 0, opacity: 1, stacking: 0,
          tone: { brightness: 1, contrast: 1, saturation: 1 },
        },
        previous: {
          xPerDepthPx: -25, yPerDepthPx: 17, scalePerDepth: 0.88, rotationPerDepthDeg: -5,
          rotationMode: "alternate", opacityPerDepth: 0.78, stackingPerDepth: -1,
          tonePerDepth: { brightness: 0.78, contrast: 1, saturation: 0.7 },
        },
        next: {
          xPerDepthPx: 25, yPerDepthPx: -17, scalePerDepth: 0.88, rotationPerDepthDeg: 5,
          rotationMode: "alternate", opacityPerDepth: 0.78, stackingPerDepth: -1,
          tonePerDepth: { brightness: 0.78, contrast: 1, saturation: 0.7 },
        },
      },
      reflow: { durationFrames: 3, easing: "ease-in-out" },
      presentation: {
        clip: { kind: "rounded", radiusPx: 10 },
        padding: { topPx: 4, rightPx: 4, bottomPx: 4, leftPx: 4 },
        border: { widthPx: 2, style: "solid", color: "#ffffff" },
        shadows: [{ offsetX: 0, offsetY: 5, blurPx: 10, spreadPx: 0, color: "#00000099" }],
      },
      motion: {
        enter: { operator: "fade", durationFrames: 2, easing: "ease-out" },
        sustain: [],
        exit: { operator: "fade", durationFrames: 2, easing: "ease-in" },
      },
      stackingOrder: 20,
    });
    const program = deckTrack.finalizeDepthStack(
      cards,
      deckTrack.sealDepthStackHeader({ id: "proof-stack" }),
      { xPx: 60, yPx: 45, widthPx: 120, heightPx: 90 },
      spec,
      frames,
      semantic,
    );
    const track = deckTrack.renderDepthStack(canvas, space, program);
    const document = compileHyperframesDocument(sealComposition({
      id: "depth-stack-browser-proof",
      canvas: { width, height, clearColor: "#090b12" }, tracks: [track],
    }), space);
    await writeFile(path.join(temp, "index.html"), materializeHyperframesHtml(document, (artifact) => {
      const materialized = paths.get(artifact.digest);
      if (materialized === undefined) throw new Error(`Unexpected DepthStack Artifact ${artifact.digest}`);
      return materialized;
    }));
    const render = async (workers: number, name: string): Promise<Buffer[]> => {
      const output = path.join(temp, name);
      await mkdir(output);
      const result = spawnSync(process.execPath, [
        hyperframesCli, "render", temp,
        "--format", "png-sequence", "--output", output, "--fps", String(fps), "--workers", String(workers),
        "--no-browser-gpu", "--no-best-effort", "--quiet",
      ], { windowsHide: true, encoding: "utf8", timeout: 110_000 });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return Promise.all((await collectPngs(output)).map(async (file) => decodedRgba(file, width, height)));
    };
    const sequential = await render(1, "sequential");
    const partitioned = await render(3, "partitioned");
    assert.equal(sequential.length, frames);
    assert.equal(partitioned.length, frames);
    for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
      assert.deepEqual(partitioned[frameIndex], sequential[frameIndex],
        `DepthStack frame ${frameIndex} changed under partitioned/out-of-order evaluation`);
    }
    const currentColorCount = (frame: Buffer, color: "red" | "green" | "blue") => matchingPixels(
      frame, width, { left: 35, top: 20, right: 205, bottom: 160 },
      (red, green, blue) => color === "red"
        ? red > 170 && green < 100 && blue < 110
        : color === "green"
          ? green > 150 && red < 100 && blue < 130
          : blue > 160 && red < 120 && green < 150,
    );
    assert.ok(currentColorCount(sequential[3]!, "red") > 4_000, "first Deck stage did not paint its current Card");
    assert.ok(currentColorCount(sequential[9]!, "green") > 4_000, "second Deck stage did not reflow to its current Card");
    assert.ok(currentColorCount(sequential[15]!, "blue") > 4_000, "third Deck stage did not reflow to its current Card");
    assert.notDeepEqual(sequential[5], sequential[7], "Deck reflow produced no visual state change");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("all three Ranking components paint frame-pure progressive states under partitioned browser rendering", {
  skip: !enabled,
  timeout: 120_000,
}, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "hypit-ranking-visual-"));
  try {
    const width = 480;
    const height = 512;
    const fps = 12;
    const frames = 24;
    const installed = await installedOpenFont("inter", 700, "normal");
    const font = installed.font;
    const paths = new Map<Digest, string>();
    let fontIndex = 0;
    for (const [artifactDigest, bytes] of installed.bytes) {
      const name = `font-${fontIndex++}.woff2`;
      await writeFile(path.join(temp, name), bytes);
      paths.set(artifactDigest, `./${name}`);
    }
    const colors = [
      [238, 54, 67, 255],
      [34, 197, 94, 255],
      [55, 105, 245, 255],
    ] as const;
    const icons = colors.map((rgba, index) => {
      const bytes = rgbaPng(40, 40, rgba);
      const artifact: BlobRef = { kind: "blob", digest: digest(bytes), size: bytes.byteLength, mediaType: "image/png" };
      const name = `ranking-${index + 1}.png`;
      paths.set(artifact.digest, `./${name}`);
      return { bytes, artifact, name };
    });
    for (const icon of icons) await writeFile(path.join(temp, icon.name), icon.bytes);
    const space = sealProgramSpace({
      durationSec: frames / fps,
      frameRate: { numerator: fps, denominator: 1 },
    });
    const semantic = semanticTrackFixture(space, { anchors: [
        { identity: "outer-start", frame: 0 },
        { identity: "rank-1", frame: 2 },
        { identity: "rank-2", frame: 8 },
        { identity: "rank-3", frame: 14 },
        { identity: "terminal", frame: 20 },
        { identity: "outer-end", frame: frames },
      ] });
    const outer = {
      id: "ranking-window",
      occurrences: [{ occurrence: 0, startAnchorId: "outer-start", endAnchorId: "outer-end" }],
    };
    const triggers = {
      id: "ranking-next",
      occurrences: ["rank-1", "rank-2", "rank-3"].map((anchorId, occurrence) => ({ occurrence, anchorId })),
    };
    const terminal = {
      id: "ranking-terminal",
      occurrences: [{ occurrence: 0, anchorId: "terminal" }],
    };
    const schedule = (header: rankingTrack.RankingHeader, specs: readonly rankingTrack.RankingItemSpec[]) => {
      let set = rankingTrack.createRankingItemSpecSet(header);
      for (const spec of specs) set = rankingTrack.appendRankingItemSpec(set, spec);
      return rankingTrack.buildRankingSchedule({ header, items: set, semantic, outer, triggers, terminal });
    };
    const recipe = (path: string, properties: SvsRecipe["properties"]): SvsRecipe => ({
      path, properties,
    });
    const tierHeader = rankingTrack.sealRankingHeader({ id: "browser-tier", variant: "tier-board" });
    const tierSpecs = [
      { variant: "tier-board", id: "tier-one", tier: "s", entry: "stage" },
      { variant: "tier-board", id: "tier-two", tier: "a", entry: "direct" },
      { variant: "tier-board", id: "tier-three", tier: "s", entry: "direct" },
    ] as const;
    let tierItems = rankingTrack.createTierBoardItemSet();
    tierSpecs.forEach((spec, index) => { tierItems = rankingTrack.appendTierBoardItem(tierItems, spec, icons[index]!.artifact); });
    const tierStyle = rankingTrack.decodeTierBoardStyle(recipe("browser.tier", {
      rows: "s:S:#ef4444|a:A:#22c55e", "font-size": 15, "appear-frames": 2, "move-frames": 2,
      padding: 6, "label-width": 36, "row-height": 54, "row-gap": 4, "cell-gap": 5,
      "icon-size": 42, "icon-radius": 7, "stage-size": 56,
    }), font).style;
    const tierTrack = rankingTrack.renderTierBoard(space, rankingTrack.buildTierBoardProgram(
      tierHeader, { xPx: 20, yPx: 20, widthPx: 440, heightPx: 140 },
      schedule(tierHeader, tierSpecs), tierStyle, tierItems,
    ));

    const columnHeader = rankingTrack.sealRankingHeader({ id: "browser-column", variant: "column" });
    const columnSpecs = ["one", "two", "three"].map((id, index) => ({
      variant: "column" as const, id: `column-${id}`, label: `${index + 1}. ${id}`,
      rank: index + 1, preset: true,
    }));
    let columnItems = rankingTrack.createColumnItemSet();
    columnSpecs.forEach((spec, index) => { columnItems = rankingTrack.appendColumnItem(columnItems, spec, index === 1 ? icons[index]!.artifact : undefined); });
    const columnStyle = rankingTrack.decodeColumnStyle(recipe("browser.column", {
      "font-size": 15, "appear-frames": 2, "move-frames": 2, padding: 6, "row-height": 35,
      "row-gap": 4, "icon-size": 26, "icon-radius": 5, "stage-size": 46,
    }), font).style;
    let columnSpecSet = rankingTrack.createRankingItemSpecSet(columnHeader);
    for (const spec of columnSpecs) columnSpecSet = rankingTrack.appendRankingItemSpec(columnSpecSet, spec);
    const columnSchedule = rankingTrack.buildColumnSchedule({
      header: columnHeader,
      items: columnSpecSet,
      outer: rankingTrack.projectColumnSelectionOuterWindow(semantic, outer),
      candidates: rankingTrack.createColumnWindowCandidateSet(),
    });
    const columnCanvas = sealCanvasSpace({
      widthPx: width, heightPx: height,
      origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square",
    });
    const columnTrack = rankingTrack.renderColumn(space, rankingTrack.buildColumnProgram(
      columnHeader, columnCanvas, { xPx: 20, yPx: 180, widthPx: 440, heightPx: 140 },
      columnSchedule, columnStyle, columnItems,
    ));

    const topHeader = rankingTrack.sealRankingHeader({ id: "browser-top", variant: "top-three" });
    const topSpecs = ["Gold", "Silver", "Bronze"].map((label, index) => ({
      variant: "top-three" as const, id: `top-${index + 1}`, label,
    }));
    let topItems = rankingTrack.createTopThreeItemSet();
    topSpecs.forEach((spec, index) => { topItems = rankingTrack.appendTopThreeItem(topItems, spec, index === 1 ? undefined : icons[index]!.artifact); });
    const topStyle = rankingTrack.decodeTopThreeStyle(recipe("browser.top", {
      "font-size": 15, "appear-frames": 2, "move-frames": 2, "icon-size": 54, "icon-radius": 27,
      "slot-gap": 30, "ring-width": 3, "label-gap": 5, "baseline-y": 0.45,
    }), font).style;
    const topTrack = rankingTrack.renderTopThree(space, rankingTrack.buildTopThreeProgram(
      topHeader, { xPx: 20, yPx: 340, widthPx: 440, heightPx: 140 },
      schedule(topHeader, topSpecs), topStyle, topItems,
    ));

    const document = compileHyperframesDocument(sealComposition({
      id: "ranking-browser-proof",
      canvas: { width, height, clearColor: "#090b12" },
      tracks: [tierTrack, columnTrack, topTrack],
    }), space);
    await writeFile(path.join(temp, "index.html"), materializeHyperframesHtml(document, (artifact) => {
      const materialized = paths.get(artifact.digest);
      if (materialized === undefined) throw new Error(`Unexpected Ranking Artifact ${artifact.digest}`);
      return materialized;
    }));
    const render = async (workers: number, name: string): Promise<Buffer[]> => {
      const output = path.join(temp, name);
      await mkdir(output);
      const result = spawnSync(process.execPath, [
        hyperframesCli, "render", temp,
        "--format", "png-sequence", "--output", output, "--fps", String(fps), "--workers", String(workers),
        "--no-browser-gpu", "--no-best-effort", "--quiet",
      ], { windowsHide: true, encoding: "utf8", timeout: 110_000 });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return Promise.all((await collectPngs(output)).map(async (file) => decodedRgba(file, width, height)));
    };
    const sequential = await render(1, "sequential");
    const partitioned = await render(3, "partitioned");
    assert.equal(sequential.length, frames);
    assert.equal(partitioned.length, frames);
    for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
      const left = partitioned[frameIndex]!;
      const right = sequential[frameIndex]!;
      if (Buffer.compare(left, right) !== 0) {
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        let count = 0;
        let maxChannelDelta = 0;
        let totalChannelDelta = 0;
        for (let offset = 0; offset < left.length; offset += 4) {
          if (left[offset] === right[offset] && left[offset + 1] === right[offset + 1]
            && left[offset + 2] === right[offset + 2] && left[offset + 3] === right[offset + 3]) continue;
          const pixel = offset / 4;
          const x = pixel % width;
          const y = Math.floor(pixel / width);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          for (let channel = 0; channel < 4; channel += 1) {
            const delta = Math.abs(left[offset + channel]! - right[offset + channel]!);
            maxChannelDelta = Math.max(maxChannelDelta, delta);
            totalChannelDelta += delta;
          }
          count += 1;
        }
        // Chromium can raster the same identity-transformed glyph/icon edge
        // through equivalent compositor paths in separate worker processes.
        // Bound that microscopic edge noise tightly while continuing to reject
        // any changed Ranking state, geometry or painted region.
        assert.ok(count <= 512 && maxChannelDelta <= 48 && totalChannelDelta <= 2_500,
          `Ranking frame ${frameIndex} changed at ${count} pixels (max channel delta ${maxChannelDelta}, total ${totalChannelDelta}) in [${minX},${minY}]–[${maxX},${maxY}] under partitioning`);
      }
    }
    assert.notDeepEqual(sequential[3], sequential[9], "Ranking stages produced no visual state change");
    assert.notDeepEqual(sequential[9], sequential[15], "later Ranking triggers produced no visual state change");
    const settled = sequential[22]!;
    for (const [name, top, bottom] of [["TierBoard", 20, 160], ["Column", 180, 320], ["TopThree", 340, 480]] as const) {
      assert.ok(matchingPixels(settled, width, { left: 20, top, right: 460, bottom }, (red, green, blue) => red + green + blue > 120) > 500,
        `${name} did not paint its settled suffix`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("all Spatial fit modes and equal-point alignments reach exact browser pixels", {
  skip: !enabled,
  timeout: 120_000,
}, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "hypit-spatial-visual-"));
  try {
    const width = 530;
    const height = 280;
    const sourceBytes = rgbaPng(40, 20, [250, 205, 25, 255]);
    const source: BlobRef = {
      kind: "blob", digest: digest(sourceBytes), size: sourceBytes.byteLength, mediaType: "image/png",
    };
    await writeFile(path.join(temp, "source.png"), sourceBytes);
    const canvas = sealCanvasSpace({
      widthPx: width, heightPx: height,
      origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square",
    });
    const space = sealProgramSpace({
      durationSec: 1, frameRate: { numerator: 1, denominator: 1 },
    });
    const semantic = semanticTrackFixture(space);
    const header = mediaTrack.sealMediaTrackHeader({ id: "spatial-browser" });
    const extent = { widthPx: 40, heightPx: 20 };
    const appearance = { opacity: 1, filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 } };
    let set = mediaTrack.createMediaTrackSet();
    let stackingOrder = 1;
    const append = (
      id: string,
      frame: { readonly xPx: number; readonly yPx: number; readonly widthPx: number; readonly heightPx: number },
      fit: {
        readonly sizing: "contain" | "cover" | "fit-width" | "fit-height" | "native" | "scale-down" | "stretch";
        readonly framePoint: { readonly x: number; readonly y: number };
        readonly contentPoint: { readonly x: number; readonly y: number };
        readonly offsetPx: { readonly x: number; readonly y: number };
        readonly constraint: "bounded" | "free";
      },
      clip: "frame" | "none" = "frame",
    ): void => {
      const layers = mediaTrack.appendStillMediaLayer(
        mediaTrack.createMediaLayerSet(), source, extent, fit,
        mediaTrack.sealMediaSampleLayerSpec({
          id: `${id}:source`, appearance,
        }),
      );
      set = mediaTrack.appendProgramMediaItem(
        set, header, semantic, canvas, layers, frame,
        mediaTrack.sealMediaItemSpec({
          id,
          projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
          expansion: { kind: "one" },
          presentation: {
            clip: { kind: clip },
            padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 },
            shadows: [],
          },
          motion: { sustain: [] }, stackingOrder: stackingOrder++,
        }),
        mediaTrack.createMediaSoundSet(),
      );
    };

    const sizings = ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"] as const;
    for (const [index, sizing] of sizings.entries()) {
      append(`fit-${sizing}`, {
        xPx: 5 + index * 75, yPx: 5, widthPx: 60, heightPx: 60,
      }, {
        sizing,
        framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.5, y: 0.5 },
        offsetPx: { x: 0, y: 0 }, constraint: "bounded",
      });
    }
    const points = [0, 0.5, 1] as const;
    for (const [row, y] of points.entries()) {
      for (const [column, x] of points.entries()) {
        append(`align-${column}-${row}`, {
          xPx: 5 + column * 70, yPx: 85 + row * 50, widthPx: 50, heightPx: 40,
        }, {
          sizing: "native",
          framePoint: { x, y }, contentPoint: { x, y }, offsetPx: { x: 0, y: 0 }, constraint: "bounded",
        });
      }
    }
    const displacedFit = {
      sizing: "native" as const,
      framePoint: { x: 1, y: 1 }, contentPoint: { x: 0, y: 0 },
      offsetPx: { x: 20, y: 20 },
    };
    append("bounded-displaced", {
      xPx: 230, yPx: 85, widthPx: 50, heightPx: 40,
    }, { ...displacedFit, constraint: "bounded" });
    append("free-displaced", {
      xPx: 300, yPx: 85, widthPx: 50, heightPx: 40,
    }, { ...displacedFit, constraint: "free" }, "none");
    const stretch = {
      sizing: "stretch" as const,
      framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.5, y: 0.5 },
      offsetPx: { x: 0, y: 0 }, constraint: "bounded" as const,
    };
    append("partially-off-canvas", {
      xPx: -20, yPx: 235, widthPx: 40, heightPx: 40,
    }, stretch);
    append("fully-off-canvas", {
      xPx: -80, yPx: 235, widthPx: 40, heightPx: 40,
    }, stretch);

    const track = mediaTrack.projectMediaVisualTrack(space, mediaTrack.finalizeMediaTrack(set, header, space));
    const document = compileHyperframesDocument(sealComposition({
      id: "spatial-browser-proof",
      canvas: { width, height, clearColor: "#000000" }, tracks: [track],
    }), space);
    await writeFile(path.join(temp, "index.html"), materializeHyperframesHtml(document, (artifact) => {
      if (artifact.digest !== source.digest) throw new Error(`Unexpected Spatial Artifact ${artifact.digest}`);
      return "./source.png";
    }));
    const output = path.join(temp, "frames");
    await mkdir(output);
    const result = spawnSync(process.execPath, [
      hyperframesCli, "render", temp,
      "--format", "png-sequence", "--output", output, "--fps", "1", "--workers", "1",
      "--no-browser-gpu", "--no-best-effort", "--quiet",
    ], { windowsHide: true, encoding: "utf8", timeout: 110_000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const files = await collectPngs(output);
    assert.equal(files.length, 1);
    const rgba = decodedRgba(files[0]!, width, height);
    const yellow = (red: number, green: number, blue: number): boolean => red > 220 && green > 170 && blue < 80;
    const fitBounds = [
      { left: 0, top: 15, right: 60, bottom: 45 },
      { left: 0, top: 0, right: 60, bottom: 60 },
      { left: 0, top: 15, right: 60, bottom: 45 },
      { left: 0, top: 0, right: 60, bottom: 60 },
      { left: 10, top: 20, right: 50, bottom: 40 },
      { left: 10, top: 20, right: 50, bottom: 40 },
      { left: 0, top: 0, right: 60, bottom: 60 },
    ];
    for (const [index, expected] of fitBounds.entries()) {
      const frameLeft = 5 + index * 75;
      assert.deepEqual(
        matchingBounds(rgba, width, { left: frameLeft, top: 5, right: frameLeft + 60, bottom: 65 }, yellow),
        {
          left: frameLeft + expected.left, top: 5 + expected.top,
          right: frameLeft + expected.right, bottom: 5 + expected.bottom,
        },
        sizings[index],
      );
    }
    for (const [row, y] of points.entries()) {
      for (const [column, x] of points.entries()) {
        const frameLeft = 5 + column * 70;
        const frameTop = 85 + row * 50;
        assert.deepEqual(
          matchingBounds(rgba, width, {
            left: frameLeft, top: frameTop, right: frameLeft + 50, bottom: frameTop + 40,
          }, yellow),
          {
            left: frameLeft + 10 * x, top: frameTop + 20 * y,
            right: frameLeft + 10 * x + 40, bottom: frameTop + 20 * y + 20,
          },
          `equal-point ${x},${y}`,
        );
      }
    }
    assert.deepEqual(
      matchingBounds(rgba, width, { left: 220, top: 80, right: 290, bottom: 135 }, yellow),
      { left: 240, top: 105, right: 280, bottom: 125 },
      "bounded unequal focal points",
    );
    assert.deepEqual(
      matchingBounds(rgba, width, { left: 350, top: 130, right: 430, bottom: 180 }, yellow),
      { left: 370, top: 145, right: 410, bottom: 165 },
      "free unequal focal points",
    );
    assert.deepEqual(
      matchingBounds(rgba, width, { left: 0, top: 235, right: 60, bottom: 275 }, yellow),
      { left: 0, top: 235, right: 20, bottom: 275 },
      "partially and fully off-Canvas Frames",
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("every official Screen Overlay survives real sequential and parallel browser frames identically", {
  skip: !enabled,
  timeout: 120_000,
}, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "hypit-screen-overlay-visual-"));
  try {
    const width = 128;
    const height = 96;
    const canvas = sealCanvasSpace({
      widthPx: width,
      heightPx: height,
      origin: "top-left",
      xDirection: "right",
      yDirection: "down",
      pixelAspect: "square",
    });
    const space = sealProgramSpace({
      durationSec: 1,
      frameRate: { numerator: 12, denominator: 1 },
    });
    const semantic = semanticTrackFixture(space);
    const header = sealScreenOverlayHeader({ id: "browser-overlays" });
    const components: readonly ScreenOverlayComponent[] = [
      { kind: "flash", color: "#ffffff", intensity: 0.2, attackFrames: 2, holdFrames: 2, decayFrames: 4 },
      { kind: "color-wash", color: "#2030ff", opacity: 0.08 },
      { kind: "vignette", center: { x: 0.5, y: 0.5 }, radius: { x: 0.8, y: 0.7 }, softness: 0.4, color: "#000000", opacity: 0.25 },
      { kind: "scan-lines", spacingPx: 7, thicknessPx: 1, angleDeg: 3, opacity: 0.1, travelPx: 8 },
      { kind: "directional-matte", angleDeg: 12, coverage: 0.4, feather: 0.3, color: "#ffcc88", opacity: 0.08, progress: { from: -0.5, to: 1.5 } },
      { kind: "whip-veil", direction: "right", widthPx: 36, softnessPx: 8, travelPx: 180, opacity: 0.12 },
      { kind: "glitch-veil", bars: 5, colors: ["#ff0055", "#00ddff"], opacity: 0.12, travelPx: 16, seed: 7 },
      { kind: "grain", amount: 0.12, grainSizePx: 2, chroma: "monochrome", motionRatePxPerFrame: 0.25, seed: 11 },
      { kind: "light-leak", colors: ["#ff3300", "#ffd000"], angleDeg: 25, softness: 0.25, travelPx: 24, intensity: 0.1, seed: 13 },
      { kind: "bokeh", amount: 0.12, sizeMinPx: 4, sizeMaxPx: 12, color: "#ffe2aa", warmth: 0.3, driftPx: 12, seed: 17 },
      { kind: "tv-static", amount: 0.05, noiseSizePx: 4, scanLineOpacity: 0.08, motionRatePxPerFrame: 0.2, seed: 19 },
    ];
    let set: ScreenOverlaySet = createScreenOverlaySet();
    components.forEach((content, index) => {
      set = appendProgramScreenOverlay(set, header, semantic, sealScreenOverlayItemSpec({

        id: `${content.kind}-${index + 1}`,
        content,
        projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
        expansion: { kind: "one" },
        stackingOrder: index + 1,
      }));
    });
    const track = renderScreenOverlay(canvas, space, finalizeScreenOverlay(set, header));
    const document = compileHyperframesDocument(sealComposition({
      id: "screen-overlay-browser-proof",
      canvas: { width, height, clearColor: "#000000" },
      tracks: [track],
    }), space);
    await writeFile(path.join(temp, "index.html"), materializeHyperframesHtml(document, (artifact) => {
      throw new Error(`Screen Overlay unexpectedly requested Artifact ${artifact.digest}`);
    }));
    const render = async (workers: number, name: string): Promise<string[]> => {
      const output = path.join(temp, name);
      await mkdir(output);
      const result = spawnSync(process.execPath, [
        hyperframesCli, "render", temp,
        "--format", "png-sequence", "--output", output, "--fps", "12", "--workers", String(workers),
        "--no-browser-gpu", "--no-best-effort", "--quiet",
      ], { windowsHide: true, encoding: "utf8", timeout: 110_000 });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return collectPngs(output);
    };
    const sequential = await render(1, "sequential");
    const parallel = await render(3, "parallel");
    assert.equal(sequential.length, 12);
    assert.equal(parallel.length, 12);
    const sequentialPixels = sequential.map((frame) => decodedRgba(frame, width, height));
    const parallelPixels = parallel.map((frame) => decodedRgba(frame, width, height));
    for (let frame = 0; frame < 12; frame += 1) {
      assert.deepEqual(parallelPixels[frame], sequentialPixels[frame], `frame ${frame} changed under partitioning`);
    }
    assert.notDeepEqual(sequentialPixels[0], sequentialPixels[6], "authored Overlay envelopes painted no temporal change");
    assert.ok(sequentialPixels.some((pixels) => pixels.some((channel, index) => index % 4 !== 3 && channel > 0)),
      "the combined official Overlay set painted no visible pixels");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
