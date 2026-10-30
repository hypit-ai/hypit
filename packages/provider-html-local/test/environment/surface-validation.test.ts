import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { verifyCompositableSurfaceFile, verifyPictureArtifactFile } from "../../src/surface-validation.js";
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
    picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full",
      bitDepth: 8, alphaMode: options.alphaMode },
    timing: options.timing,
  };
}

test("cancelling staged Surface inspection stops both probes and preserves the caller's file", {
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
    const path = join(directory, "staged.png");
    await writeFile(path, bytes);
    const controller = new AbortController();
    const checking = verifyCompositableSurfaceFile({ surface: value, path, ffprobePath: program,
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
    assert.deepEqual([...await readFile(path)], [...bytes]);
    await writeFile(program, `#!${process.execPath}
console.log(JSON.stringify(process.argv.includes('-show_pixel_formats')
 ? { pixel_formats: [{ name: 'rgb24', flags: { alpha: 0 }, components: [{ bit_depth: 8 }, { bit_depth: 8 }, { bit_depth: 8 }] }] }
 : { streams: [{ codec_type: 'video', width: 1, height: 1, pix_fmt: 'rgb24', nb_read_frames: '1',
   color_primaries: 'bt709', color_transfer: 'iec61966-2-1', color_space: 'gbr', color_range: 'pc' }] }));
`);
    await verifyCompositableSurfaceFile({ surface: value, path, ffprobePath: program });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Surface file admission accepts matching still/video bytes and rejects contradictions", {
  skip: !hasMediaTools,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-surface-test-"));
  try {
    const opaquePath = join(directory, "opaque.png");
    const untaggedPath = join(directory, "untagged.png");
    const alphaPath = join(directory, "alpha.png");
    const videoPath = join(directory, "video.mp4");
    const srgb = "setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=gbr:range=pc";
    await ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=8x6:d=1", "-frames:v", "1", "-vf", srgb, opaquePath]);
    await ffmpeg(["-f", "lavfi", "-i", "color=c=green:s=8x6:d=1", "-frames:v", "1", untaggedPath]);
    await ffmpeg(["-f", "lavfi", "-i", "color=c=red@0.5:s=8x6:d=1,format=rgba", "-frames:v", "1", "-vf", srgb, alphaPath]);
    await ffmpeg([
      "-f", "lavfi", "-i", "color=c=blue:s=8x6:r=4:d=1",
      "-frames:v", "4", "-vf", "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", videoPath,
    ]);
    const [opaque, untagged, alpha, video] = await Promise.all([
      readFile(opaquePath), readFile(untaggedPath), readFile(alphaPath), readFile(videoPath),
    ]);
    const opaqueSurface = surface(opaque, {
      mediaType: "image/png", width: 8, height: 6, alphaMode: "opaque", timing: { kind: "still" },
    });
    const alphaSurface = surface(alpha, {
      mediaType: "image/png", width: 8, height: 6, alphaMode: "straight", timing: { kind: "still" },
    });
    const untaggedSurface = surface(untagged, {
      mediaType: "image/png", width: 8, height: 6, alphaMode: "opaque", timing: { kind: "still" },
    });
    const videoSurface = { ...surface(video, {
      mediaType: "video/mp4", width: 8, height: 6, alphaMode: "opaque",
      timing: { kind: "frames", frameRate: { numerator: 4, denominator: 1 }, frameCount: 4 },
    }), picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const };

    await verifyCompositableSurfaceFile({ surface: opaqueSurface, path: opaquePath });
    await verifyCompositableSurfaceFile({ surface: untaggedSurface, path: untaggedPath });
    await verifyCompositableSurfaceFile({ surface: alphaSurface, path: alphaPath });
    await verifyCompositableSurfaceFile({ surface: videoSurface, path: videoPath });
    await verifyPictureArtifactFile({ picture: opaqueSurface.picture, path: opaquePath });
    await verifyPictureArtifactFile({ picture: untaggedSurface.picture, path: untaggedPath });
    await verifyPictureArtifactFile({ picture: { ...untaggedSurface.picture, alphaMode: "straight" },
      path: untaggedPath });
    await assert.rejects(verifyPictureArtifactFile({ picture: {
      colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
    }, path: opaquePath }), /contradicts its declared picture interpretation/u,
    "browser still admission must not treat broadly compatible metadata as author evidence");
    await verifyCompositableSurfaceFile({ surface: videoSurface, path: videoPath });
    await assert.rejects(verifyCompositableSurfaceFile({ surface: {
      ...videoSurface, artifact: { ...videoSurface.artifact, size: video.byteLength + 1 },
    }, path: videoPath }), /byte size differs/u);
    await assert.rejects(verifyCompositableSurfaceFile({ surface: {
      ...videoSurface, width: 10,
    }, path: videoPath }), /dimensions differ/u);
    assert.deepEqual(await readFile(videoPath), video, "inspection never rewrites or deletes the caller's file");

    await assert.rejects(
      verifyCompositableSurfaceFile({ surface: { ...opaqueSurface, width: 9 }, path: opaquePath }),
      /dimensions differ/u,
    );
    await assert.rejects(
      verifyCompositableSurfaceFile({ surface: { ...alphaSurface,
        picture: { ...alphaSurface.picture, alphaMode: "opaque" } }, path: alphaPath }),
      /encoded format carries alpha/u,
    );
    await assert.rejects(
      verifyCompositableSurfaceFile({
        surface: {
          ...videoSurface,
          timing: { kind: "frames", frameRate: { numerator: 4, denominator: 1 }, frameCount: 3 },
        },
        path: videoPath,
      }),
      /frame count differs/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
