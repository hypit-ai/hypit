import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { verifyPictureArtifactFile } from "../../src/picture-validation.js";

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

test("Picture Artifact admission accepts declared still bytes and rejects contradictions", {
  skip: !hasMediaTools,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-picture-test-"));
  try {
    const opaquePath = join(directory, "opaque.png");
    const untaggedPath = join(directory, "untagged.png");
    const alphaPath = join(directory, "alpha.png");
    const srgb = "setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=gbr:range=pc";
    await ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=8x6:d=1", "-frames:v", "1", "-vf", srgb, opaquePath]);
    await ffmpeg(["-f", "lavfi", "-i", "color=c=green:s=8x6:d=1", "-frames:v", "1", untaggedPath]);
    await ffmpeg(["-f", "lavfi", "-i", "color=c=red@0.5:s=8x6:d=1,format=rgba", "-frames:v", "1", "-vf", srgb, alphaPath]);

    const opaque = {
      colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
      colorRange: "full", bitDepth: 8, alphaMode: "opaque",
    } as const;
    await verifyPictureArtifactFile({ picture: opaque, path: opaquePath });
    await verifyPictureArtifactFile({ picture: opaque, path: untaggedPath });
    await verifyPictureArtifactFile({ picture: { ...opaque, alphaMode: "straight" }, path: alphaPath });
    await assert.rejects(verifyPictureArtifactFile({ picture: {
      colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
    }, path: opaquePath }), /contradicts its declared picture interpretation/u);
    await assert.rejects(verifyPictureArtifactFile({ picture: opaque, path: alphaPath }),
      /encoded format carries alpha/u);
    assert.ok((await readFile(opaquePath)).byteLength > 0, "inspection leaves the caller's file intact");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
