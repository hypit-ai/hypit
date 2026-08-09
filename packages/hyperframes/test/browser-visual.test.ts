import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { resolveCaptionProgram } from "@narratage/caption";
import type { TimedCaptionProjection } from "@narratage/caption";
import { fineCaptionStyle, renderFineCaption } from "@narratage/caption-fine";
import { decodeOpenFontFaceSurface } from "@narratage/fonts-open";
import type { FontArtifactRef } from "@narratage/media";
import { sealProgramSpace } from "@narratage/program-space";
import { sealComposition, sealVisualTrack } from "@narratage/composition";
import assert from "node:assert/strict";
import {
  compileHyperframesDocument,
  materializeHyperframesHtml,
} from "@narratage/hyperframes";
import type { Digest } from "@narratage/protocol";
import { captionDisplaySequence, parseScript } from "@narratage/script";
import type { SvsRecipe } from "@narratage/svs";

const enabled = process.env.SVML_BROWSER_TESTS === "1";
const localFont = process.env.SVML_TEST_FONT_PATH
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
  ], { encoding: "buffer", timeout: 30_000 });
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
  ], { encoding: "buffer", timeout: 30_000 });
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
  const temp = await mkdtemp(path.join(os.tmpdir(), "svml-hyperframes-visual-"));
  try {
    const fontBytes = await import("node:fs/promises").then(({ readFile }) => readFile(localFont));
    const surfaceBytes = rgbaPng(64, 64, [255, 0, 0, 128]);
    const fontDigest = digest(fontBytes);
    const surfaceDigest = digest(surfaceBytes);
    const font: FontArtifactRef = {
      contract: "svml.font-artifact@1",
      sources: [{ artifact: { kind: "blob", digest: fontDigest, size: fontBytes.byteLength, mediaType: "font/ttf" } }],
      weight: 400,
      style: "normal",
    };
    const space = sealProgramSpace({
      contract: "svml.program-space@1",
      durationSec: 1 / 30,
      frameRate: { numerator: 30, denominator: 1 },
    });
    const lower = sealVisualTrack({
      contract: "svml.visual-track@1",
      visualIr: "svml.visual-ir@1",
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
      contract: "svml.visual-track@1",
      visualIr: "svml.visual-ir@1",
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
            contract: "svml.compositable-surface@1",
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
      contract: "svml.visual-track@1",
      visualIr: "svml.visual-ir@1",
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
      contract: "svml.composition@1",
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
    ], { encoding: "utf8", timeout: 110_000 });
    assert.equal(render.status, 0, `${render.stdout}\n${render.stderr}`);
    const renderedFrame = await findPng(output);
    assert(renderedFrame !== undefined, "Hyperframes did not emit a PNG frame.");
    const decoded = spawnSync("ffmpeg", [
      "-v", "error",
      "-i", renderedFrame,
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      "pipe:1",
    ], { encoding: "buffer", timeout: 30_000 });
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
  const temp = await mkdtemp(path.join(os.tmpdir(), "svml-caption-fine-visual-"));
  try {
    const width = 720;
    const height = 240;
    const space = sealProgramSpace({
      contract: "svml.program-space@1",
      durationSec: 4,
      frameRate: { numerator: 10, denominator: 1 },
    });
    const narrative = parseScript("visual.svml", "<line>One two three four.</line>");
    const display = captionDisplaySequence(narrative, "visual.caption");
    const fontBytes = await import("node:fs/promises").then(({ readFile }) => readFile(localFont));
    const font: FontArtifactRef = {
      contract: "svml.font-artifact@1",
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
        contract: "svml.svs-recipe@1",
        path: `caption.${mode}-${transition}`,
        properties: {
          "cue-min-words": 1, "cue-max-words": 4,
          "stack-order": 10 + index, x: 0.125 + index * 0.25, y: 0.82, width: 0.22,
          "anchor-x": "center", "anchor-y": "bottom",
          font: "Exact Test Font", weight: 400, size: 32, "line-height": 1,
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
        contract: "svml.timed-caption-projection@1",
        displaySequenceId: display.id,
        cues: [{
          id: `${mode}-${transition}-cue`, runId: program.runs[0]!.id, styleId: style.id, segmentId: "line",
          startSec: 0, endSec: 4,
          atoms: display.atoms.map((atom, atomIndex) => ({
            atomId: atom.id, startSec: atomIndex, endSec: atomIndex + 1,
          })),
          fields: [],
        }],
      };
      return renderFineCaption(projection, program, display, space);
    });
    const document = compileHyperframesDocument(sealComposition({
      contract: "svml.composition@1",
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
    ], { encoding: "utf8", timeout: 110_000 });
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
  const temp = await mkdtemp(path.join(os.tmpdir(), "svml-caption-fine-pill-"));
  try {
    const width = 480;
    const height = 280;
    const space = sealProgramSpace({
      contract: "svml.program-space@1", durationSec: 6, frameRate: { numerator: 10, denominator: 1 },
    });
    const narrative = parseScript("pill.svml", "<line>Every caption word joins across lines.</line>");
    const display = captionDisplaySequence(narrative, "pill.caption");
    const fontBytes = await import("node:fs/promises").then(({ readFile }) => readFile(localFont));
    const font: FontArtifactRef = {
      contract: "svml.font-artifact@1",
      sources: [{ artifact: { kind: "blob", digest: digest(fontBytes), size: fontBytes.byteLength, mediaType: "font/ttf" } }],
      weight: 400,
      style: "normal",
    };
    const recipe: SvsRecipe = {
      contract: "svml.svs-recipe@1",
      path: "caption.joined-pill",
      properties: {
        "cue-min-words": 1, "cue-max-words": 8,
        "stack-order": 20, x: 0.5, y: 0.5, width: 0.5,
        "anchor-x": "center", "anchor-y": "center",
        font: "Exact Test Font", weight: 400, size: 36, "line-height": 1.5,
        align: "left", fill: "#FFFFFF", background: "#00000000", padding: "0 0", radius: 0,
        "word-gap": 8,
        "active-box": "trail", "active-box-continuity": "joined",
        "active-box-background": "#00FF00", "active-box-padding": "3 7", "active-box-radius": 7,
      },
    };
    const style = fineCaptionStyle("joined-pill", recipe, [font]);
    const program = resolveCaptionProgram(display, "joined-pill-program", style, []);
    const projection: TimedCaptionProjection = {
      contract: "svml.timed-caption-projection@1", displaySequenceId: display.id,
      cues: [{
        id: "joined-pill-cue", runId: program.runs[0]!.id, styleId: style.id, segmentId: "line",
        startSec: 0, endSec: 6,
        atoms: display.atoms.map((atom, index) => ({ atomId: atom.id, startSec: index, endSec: index + 1 })),
        fields: [],
      }],
    };
    const track = renderFineCaption(projection, program, display, space);
    const document = compileHyperframesDocument(sealComposition({
      contract: "svml.composition@1",
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
    ], { encoding: "utf8", timeout: 110_000 });
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
  const temp = await mkdtemp(path.join(os.tmpdir(), "svml-caption-fine-multilingual-"));
  try {
    const width = 720;
    const height = 320;
    const durationSec = 1 / 30;
    const space = sealProgramSpace({
      contract: "svml.program-space@1",
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
      font: "Exact Multilingual Stack", weight: 700, size: 72, "line-height": 1,
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
        contract: "svml.svs-recipe@1",
        path: `caption.${id}`,
        properties: { ...base, ...properties },
      };
      const style = fineCaptionStyle(id, recipe, fonts);
      const program = resolveCaptionProgram(display, `${id}-program`, style, []);
      const projection: TimedCaptionProjection = {
        contract: "svml.timed-caption-projection@1",
        displaySequenceId: display.id,
        cues: [{
          id: `${id}-cue`, runId: program.runs[0]!.id, styleId: style.id, segmentId: "line",
          startSec: 0, endSec: durationSec,
          atoms: display.atoms.map((atom) => ({ atomId: atom.id, startSec: 0, endSec: durationSec })),
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
      contract: "svml.composition@1",
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
    ], { encoding: "utf8", timeout: 110_000 });
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
