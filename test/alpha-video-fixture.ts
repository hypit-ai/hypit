import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MemoryResourceStore } from "../packages/driver-node/src/index.js";
export { MemoryResourceStore };
import { executeInspectMedia, executeNormalizeMedia } from "../packages/media-execution/src/index.js";
import type { MediaExecutionEnvironment } from "../packages/media-execution/src/index.js";
import { verifyMediaInspection, verifySynchronizedMedia } from "@hypit/media";
import { selectMediaStreams } from "@hypit/media-pipeline";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";

export const hasMediaBinaries = spawnSync("ffmpeg", ["-version"], {
  stdio: "ignore", windowsHide: true,
}).status === 0 && spawnSync("ffprobe", ["-version"], {
  stdio: "ignore", windowsHide: true,
}).status === 0;

export function ffmpegBytes(args: string[], input?: Uint8Array): Buffer {
  const result = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], {
    ...(input === undefined ? {} : { input }), maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr?.toString() ?? result.error?.message ?? "ffmpeg failed");
  return result.stdout;
}

export const alphaSize = { width: 96, height: 64 };
export async function transparentVideoFixture(directory: string, format: "webm" | "webm-vp8" | "mov") {
  const { width, height } = alphaSize;
  const rgba = Buffer.alloc(width * height * 4 * 8);
  for (let f = 0; f < 8; f++) {
    for (let y = 16; y < 48; y++) for (let x = 16 + f; x < 64 + f; x++) {
      const offset = ((f * height + y) * width + x) * 4;
      rgba[offset] = 240;
      rgba[offset + 1] = 20;
      rgba[offset + 2] = 20;
      rgba[offset + 3] = x < 48 + f ? 255 : 128;
    }
  }
  const path = join(directory, format === "mov" ? "input.mov" : "input.webm");
  ffmpegBytes(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-r", "8", "-i", "pipe:0",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
    ...(format === "webm-vp8"
      // The portrait service returns VP8 with audio before the visual stream.
      ? ["-map", "1:a:0", "-map", "0:v:0", "-c:v", "libvpx", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-c:a", "libopus"]
      : format === "webm"
      ? ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-lossless", "1", "-auto-alt-ref", "0", "-c:a", "libopus"]
      : ["-c:v", "qtrle", "-pix_fmt", "argb", "-c:a", "pcm_s16le"]),
    "-t", "1", path], rgba);
  return { path, bytes: await readFile(path), mediaType: format === "mov" ? "video/quicktime" : "video/webm" };
}

export function testMediaEnvironment(resources: MemoryResourceStore): MediaExecutionEnvironment {
  return {
    ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", processTimeoutMs: 60_000, maxProbeOutputBytes: 8 * 1024 * 1024,
    artifacts: {
      get: (source) => resources.get(source.resource),
      open: async (source) => {
        const bytes = await resources.get(source.resource);
        return bytes === undefined ? undefined : (async function* () { yield bytes; })();
      },
      put: (bytes, mediaType) => resources.put(bytes, mediaType),
      putFile: async (path, mediaType) => resources.put(await readFile(path), mediaType),
    },
  };
}

export async function normalizeTestVideo(resources: MemoryResourceStore, source: BlobRef, withAudio: boolean) {
  const env = testMediaEnvironment(resources);
  const inspected = await executeInspectMedia(env, canonicalize({ source }));
  assert.equal(inspected.value.kind, "inline");
  const inspection = inspected.value.value;
  verifyMediaInspection(inspection);
  const frameRate = { numerator: 12, denominator: 1 };
  const selection = selectMediaStreams(inspection, {
    video: { mode: "primary-moving" }, audio: { mode: withAudio ? "default" : "none" }, spanAuthority: "video", frameRate,
  });
  const result = await executeNormalizeMedia(env, canonicalize({ source, inspection, selection, frameRate,
    audio: { sampleRate: 48_000, channels: 2, codec: "pcm_s16le", loudness: "preserve" } }));
  assert.equal(result.value.kind, "inline");
  verifySynchronizedMedia(result.value.value);
  return result.value.value;
}

export async function writeTestArtifact(resources: MemoryResourceStore, source: BlobRef, path: string) {
  await writeFile(path, (await resources.get(source.resource))!);
  return path;
}
