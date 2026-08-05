import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  sealComposition,
  sealProgramSpace,
  sealVisualTrack,
} from "@svml/contracts";
import type { FontArtifactRef } from "@svml/contracts";
import {
  compileHyperframesDocument,
  materializeHyperframesHtml,
} from "@svml/hyperframes";
import type { Digest } from "@svml/protocol";

const enabled = process.env.SVML_BROWSER_TESTS === "1";
const localFont = process.env.SVML_TEST_FONT_PATH
  ?? (process.platform === "darwin" ? "/System/Library/Fonts/SFNSMono.ttf" : undefined);

function digest(bytes: Uint8Array): Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Digest;
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
      artifact: { kind: "blob", digest: fontDigest, size: fontBytes.byteLength, mediaType: "font/ttf" },
      weight: 400,
      style: "normal",
    };
    const space = sealProgramSpace({
      contract: "svml.program-space@0",
      durationSec: 1 / 30,
      frameRate: { numerator: 30, denominator: 1 },
    });
    const lower = sealVisualTrack({
      contract: "svml.visual-track@1",
      id: "blue",
      programSpaceDigest: space.digest,
      sources: [{ name: "fixture", digest: digest(Buffer.from("blue")) }],
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
      id: "surface",
      programSpaceDigest: space.digest,
      sources: [{ name: "receipt", digest: digest(Buffer.from("surface")) }],
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
      id: "text",
      programSpaceDigest: space.digest,
      sources: [{ name: "fixture", digest: digest(Buffer.from("text")) }],
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
      programSpace: space,
      canvas: { width: 64, height: 64, clearColor: "#000000" },
      tracks: [text, lower, surface],
    }));

    await copyFile(localFont, path.join(temp, "font.ttf"));
    await writeFile(path.join(temp, "surface.png"), surfaceBytes);
    const html = materializeHyperframesHtml(document, (artifactDigest) => {
      if (artifactDigest === fontDigest) return "./font.ttf";
      if (artifactDigest === surfaceDigest) return "./surface.png";
      throw new Error(`Unexpected visual-test Artifact ${artifactDigest}`);
    });
    await writeFile(path.join(temp, "index.html"), html);
    const output = path.join(temp, "frames");
    await mkdir(output);
    const render = spawnSync(process.execPath, [
      path.join(process.cwd(), "node_modules/hyperframes/bin/hyperframes.mjs"),
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
