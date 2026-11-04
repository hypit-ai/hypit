import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compileHtmlPictureProgram } from "@hypit/html-program";

import { stageHtmlProgram } from "../src/stage.js";

test("the local renderer stages only Picture-terminal artifacts", async () => {
  const artifact = {
    kind: "blob" as const,
    resource: "res_picture-terminal-stage" as const,
    size: 1,
    mediaType: "image/png",
  };
  const picture = {
    colorPrimaries: "bt709",
    colorTransfer: "srgb",
    colorMatrix: "rgb",
    colorRange: "full",
    bitDepth: 8,
    alphaMode: "straight",
  } as const;
  const program = compileHtmlPictureProgram({
    id: "stage-picture",
    frameRate: { numerator: 30, denominator: 1 },
    frameCount: 1,
    canvas: { width: 64, height: 36, clearColor: "#000000" },
    root: { id: "still", kind: "image", spans: [{ startFrame: 0, endFrameExclusive: 1 }],
      style: [], artifact, picture },
  });
  const directory = await mkdtemp(join(tmpdir(), "hypit-picture-stage-"));
  let validated = false;
  try {
    await stageHtmlProgram({
      document: program,
      directory,
      read: async (actual) => {
        assert.deepEqual(actual, artifact);
        return new Uint8Array([1]);
      },
      validatePicture: async (actual, path) => {
        assert.deepEqual(actual, picture);
        assert.equal(path, join(directory, "artifacts", "asset-0.png"));
        validated = true;
      },
    });
    assert.equal(validated, true);
    assert.deepEqual([...await readFile(join(directory, "artifacts", "asset-0.png"))], [1]);
    assert.match(await readFile(join(directory, "index.html"), "utf8"),
      /data-hypit-artifact-src="\.\/artifacts\/asset-0\.png"/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
