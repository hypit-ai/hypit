import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { verifyCompositableSurfaceBytes } from "@hypit/media-execution";
import type { CompositableSurfaceRef } from "@hypit/media";

const hasMediaTools = spawnSync("ffmpeg", ["-version"], { stdio: "ignore", windowsHide: true }).status === 0
  && spawnSync("ffprobe", ["-version"], { stdio: "ignore", windowsHide: true }).status === 0;

async function ffmpeg(argv: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...argv], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  });
}

let surfaceId = 0;

function surface(bytes: Uint8Array, options: {
  readonly mediaType: string;
  readonly width: number;
  readonly height: number;
  readonly alphaMode: "opaque" | "straight";
  readonly timing: CompositableSurfaceRef["timing"];
}): CompositableSurfaceRef {
  const resource = `res_surface-${surfaceId += 1}` as const;
  return {
    artifact: { kind: "blob", resource, size: bytes.byteLength, mediaType: options.mediaType },
    width: options.width,
    height: options.height,
    colorSpace: "srgb",
    alphaMode: options.alphaMode,
    timing: options.timing,
  };
}

test("cancelling Surface validation stops both probes without poisoning later calls", {
  skip: process.platform === "win32",
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-surface-cancel-"));
  const program = join(directory, "ffprobe");
  const marker = join(directory, "running");
  const bytes = new Uint8Array([0]);
  const value = surface(bytes, { mediaType: "image/png", width: 1, height: 1,
    alphaMode: "opaque", timing: { kind: "still" } });
  try {
    await writeFile(program, `#!${process.execPath}
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(marker)} + '-' + process.pid, '');
setInterval(() => {}, 1000);
`);
    await chmod(program, 0o755);
    const controller = new AbortController();
    const checking = verifyCompositableSurfaceBytes({ surface: value, bytes, ffprobePath: program,
      signal: controller.signal });
    const rejected = assert.rejects(checking, /stop probes/u);
    let pids: number[] = [];
    for (let i = 0; i < 200; i++) {
      pids = (await readdir(directory)).filter((name) => name.startsWith("running-"))
        .map((name) => Number(name.slice("running-".length)));
      if (pids.length === 2) break;
      await delay(10);
    }
    controller.abort(new Error("stop probes"));
    await rejected;
    assert.equal(pids.length, 2);
    for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    await writeFile(program, `#!${process.execPath}
console.log(JSON.stringify(process.argv.includes('-show_pixel_formats')
 ? { pixel_formats: [{ name: 'rgb24', flags: { alpha: 0 } }] }
 : { streams: [{ codec_type: 'video', width: 1, height: 1, pix_fmt: 'rgb24', nb_read_frames: '1' }] }));
`);
    await verifyCompositableSurfaceBytes({ surface: value, bytes, ffprobePath: program });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Surface byte admission accepts matching still/video bytes and rejects contradictions", {
  skip: !hasMediaTools,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-surface-test-"));
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
