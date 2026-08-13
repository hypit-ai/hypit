import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { verifyCompositableSurfaceBytes } from "@narratage/media-execution";
import type { CompositableSurfaceRef } from "@narratage/media";

const hasMediaTools = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
  && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

async function ffmpeg(argv: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...argv], {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  });
}

function surface(bytes: Uint8Array, options: {
  readonly mediaType: string;
  readonly width: number;
  readonly height: number;
  readonly alphaMode: "opaque" | "straight";
  readonly timing: CompositableSurfaceRef["timing"];
}): CompositableSurfaceRef {
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
  return {
    artifact: { kind: "blob", digest, size: bytes.byteLength, mediaType: options.mediaType },
    width: options.width,
    height: options.height,
    colorSpace: "srgb",
    alphaMode: options.alphaMode,
    timing: options.timing,
  };
}

test("Surface byte admission accepts matching still/video bytes and rejects contradictions", {
  skip: !hasMediaTools,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-surface-test-"));
  try {
    const opaquePath = join(directory, "opaque.png");
    const alphaPath = join(directory, "alpha.png");
    const videoPath = join(directory, "video.mp4");
    await ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=8x6:d=1", "-frames:v", "1", opaquePath]);
    await ffmpeg(["-f", "lavfi", "-i", "color=c=red@0.5:s=8x6:d=1,format=rgba", "-frames:v", "1", alphaPath]);
    await ffmpeg([
      "-f", "lavfi", "-i", "color=c=blue:s=8x6:r=4:d=1",
      "-frames:v", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", videoPath,
    ]);
    const [opaque, alpha, video] = await Promise.all([
      readFile(opaquePath), readFile(alphaPath), readFile(videoPath),
    ]);
    const opaqueSurface = surface(opaque, {
      mediaType: "image/png", width: 8, height: 6, alphaMode: "opaque", timing: { kind: "still" },
    });
    const alphaSurface = surface(alpha, {
      mediaType: "image/png", width: 8, height: 6, alphaMode: "straight", timing: { kind: "still" },
    });
    const videoSurface = surface(video, {
      mediaType: "video/mp4", width: 8, height: 6, alphaMode: "opaque",
      timing: { kind: "frames", frameRate: { numerator: 4, denominator: 1 }, frameCount: 4 },
    });

    await verifyCompositableSurfaceBytes({ surface: opaqueSurface, bytes: opaque });
    await verifyCompositableSurfaceBytes({ surface: alphaSurface, bytes: alpha });
    await verifyCompositableSurfaceBytes({ surface: videoSurface, bytes: video });

    await assert.rejects(
      verifyCompositableSurfaceBytes({ surface: { ...opaqueSurface, width: 9 }, bytes: opaque }),
      /dimensions differ/u,
    );
    await assert.rejects(
      verifyCompositableSurfaceBytes({ surface: { ...alphaSurface, alphaMode: "opaque" }, bytes: alpha }),
      /encoded format carries alpha/u,
    );
    await assert.rejects(
      verifyCompositableSurfaceBytes({
        surface: {
          ...videoSurface,
          timing: { kind: "frames", frameRate: { numerator: 4, denominator: 1 }, frameCount: 3 },
        },
        bytes: video,
      }),
      /frame count differs/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
