import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryResourceStore, ffmpegBytes, hasMediaBinaries, testMediaEnvironment, writeTestArtifact } from "../../../test/alpha-video-fixture.js";
import { executeCompositeMedia } from "../src/execute.js";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";

const SIZE = { width: 64, height: 64 };

function ffprobeSize(path: string): { readonly width: number; readonly height: number } {
  const result = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", path], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr ?? "ffprobe failed");
  const [width, height] = result.stdout.trim().split(",").map(Number);
  return { width: width!, height: height! };
}

/** Opaque red field: whatever the subject does not cover must stay red. */
function underVideo(): Buffer {
  return ffmpegBytes([
    "-f", "lavfi", "-i", `color=c=red:s=${SIZE.width}x${SIZE.height}:r=10:d=1`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-f", "matroska", "pipe:1",
  ]);
}

/**
 * Green subject with alpha 255 on the left half and 0 on the right half, written as raw RGBA so the
 * alpha plane is exactly what the test asserts on (filter-based alpha was silently flattened to
 * yuv420p and cost an hour of chasing a green full-frame overlay).
 */
function subjectVideo(): Buffer {
  const frames = 10;
  const rgba = Buffer.alloc(SIZE.width * SIZE.height * 4 * frames);
  for (let frame = 0; frame < frames; frame++) {
    for (let y = 0; y < SIZE.height; y++) {
      for (let x = 0; x < SIZE.width; x++) {
        const base = frame * SIZE.width * SIZE.height * 4 + (y * SIZE.width + x) * 4;
        rgba[base] = 0;
        rgba[base + 1] = 255;
        rgba[base + 2] = 0;
        rgba[base + 3] = x < SIZE.width / 2 ? 255 : 0;
      }
    }
  }
  return ffmpegBytes([
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${SIZE.width}x${SIZE.height}`,
    "-r", "10", "-i", "pipe:0",
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
    "-f", "webm", "pipe:1",
  ], rgba);
}

test("Composite draws the subject through its alpha and leaves the rest of the under layer visible", {
  skip: !hasMediaBinaries && "ffmpeg and ffprobe are not installed",
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-composite-"));
  try {
    const resources = new MemoryResourceStore();
    const under = await resources.put(underVideo(), "video/x-matroska");
    const over = await resources.put(subjectVideo(), "video/webm");

    const result = await executeCompositeMedia(
      testMediaEnvironment(resources),
      canonicalize({ under, over }),
    );
    assert.equal(result.value.kind, "blob");
    assert.equal(result.value.mediaType, "video/mp4");

    const output = await writeTestArtifact(resources, result.value, join(directory, "composite.mp4"));
    const pixels = ffmpegBytes(["-i", output, "-pix_fmt", "rgba", "-f", "rawvideo", "pipe:1"]);
    const stride = SIZE.width * SIZE.height * 4;
    assert.equal(pixels.length % stride, 0, "composite frame is not the under layer's size");
    const frames = pixels.length / stride;
    assert.equal(frames, 10);

    const pixel = (frame: number, x: number, y: number) => {
      const base = frame * stride + (y * SIZE.width + x) * 4;
      return { r: pixels[base]!, g: pixels[base + 1]!, b: pixels[base + 2]!, a: pixels[base + 3]! };
    };
    for (const frame of [0, 5, frames - 1]) {
      const covered = pixel(frame, 8, 32);
      assert.ok(covered.g > 180 && covered.r < 80, `frame ${frame} left half should be the green subject, got ${JSON.stringify(covered)}`);
      assert.equal(covered.a, 255, "composite output is opaque");
      const visible = pixel(frame, 56, 32);
      assert.ok(visible.r > 180 && visible.g < 80, `frame ${frame} right half should stay red, got ${JSON.stringify(visible)}`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

/**
 * Real-mask check, opt-in because it needs a SAM 3.1 mask video produced elsewhere:
 *   HYPIT_REAL_MASK=~/projects/sam-verify/out-person.webm node --import tsx --test ...
 */
const realMask = process.env.HYPIT_REAL_MASK;

test("Composite cuts a real SAM mask out of a flat under layer", {
  skip: realMask === undefined ? "set HYPIT_REAL_MASK to a SAM mask video" : false,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-composite-real-"));
  try {
    const resources = new MemoryResourceStore();
    const maskBytes = await readFile(realMask!);
    const scale = ffprobeSize(realMask!);
    const underBytes = ffmpegBytes([
      "-f", "lavfi", "-i", `color=c=blue:s=${scale.width}x${scale.height}:r=25:d=2`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-f", "matroska", "pipe:1",
    ]);
    const under = await resources.put(underBytes, "video/x-matroska");
    const over = await resources.put(new Uint8Array(maskBytes), "video/webm");
    const result = await executeCompositeMedia(testMediaEnvironment(resources), canonicalize({ under, over }));
    const output = await writeTestArtifact(resources, result.value as BlobRef, join(directory, "real.mp4"));
    const pixels = ffmpegBytes(["-i", output, "-vf", "select=eq(n\\,25)", "-frames:v", "1",
      "-pix_fmt", "rgba", "-f", "rawvideo", "pipe:1"]);
    let covered = 0;
    let visible = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]!; const g = pixels[i + 1]!; const b = pixels[i + 2]!;
      if (b > 120 && r < 90 && g < 90) visible++;
      else covered++;
    }
    const maskedFraction = covered / (covered + visible);
    // The SAM run reported 0.3747 coverage on this clip; allow generous codec slack.
    assert.ok(maskedFraction > 0.2 && maskedFraction < 0.6,
      `mask coverage came out at ${maskedFraction.toFixed(3)}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Composite refuses a Need whose operands are not Blobs", async () => {
  const resources = new MemoryResourceStore();
  await assert.rejects(
    () => executeCompositeMedia(testMediaEnvironment(resources), canonicalize({ under: { kind: "inline" } })),
    /CompositeMediaNeed is invalid/u,
  );
});
