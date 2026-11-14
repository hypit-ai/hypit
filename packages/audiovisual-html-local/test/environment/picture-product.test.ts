import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  pictureType,
  sealAudiovisualProgram,
  sealOccurrence,
} from "@hypit/audiovisual";
import {
  lowerAudiovisualPictureProgramToHtmlProgram,
  pictureProductHtmlSource,
} from "@hypit/audiovisual-html";
import { rasterizeHtmlFrames } from "@hypit/html-chromium-local";
import { compileHtmlPictureProgram } from "@hypit/html-program";
import { verifyPreparedPictureSampling } from "@hypit/media";
import { MemoryResourceStore } from "@hypit/resource-store";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import {
  exactTemporalValueFromFrames,
  exactTemporalZero,
  identityTemporalMap,
  sealLocalTemporalDomain,
  temporalRangeRegionSet,
} from "@hypit/temporal";

import { createLocalHtmlPictureProductPublisher } from "../../src/index.js";

function run(command: string, args: readonly string[], cwd: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], { cwd, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => error === null ? resolve(stdout) : reject(new Error(Buffer.from(stderr).toString())));
  });
}

test("a local HTML Operator Product preserves transparency into its transient WebM", async () => {
  const resources = new MemoryResourceStore();
  const frameRate = { numerator: 2, denominator: 1 };
  const frameCount = 2;
  const duration = exactTemporalValueFromFrames(frameCount, { frameRate });
  const domain = sealLocalTemporalDomain({ id: "html-product-time", duration });
  const pictureDomain = sealLocalSpatialDomain({
    id: "html-product-space",
    region: { x: 0, y: 0, width: 16, height: 8 },
  });
  const program = compileHtmlPictureProgram({
    id: "html-product",
    frameRate,
    frameCount,
    canvas: { width: 16, height: 8, clearColor: "transparent" },
    root: {
      id: "root",
      kind: "box",
      spans: [{ startFrame: 0, endFrameExclusive: frameCount }],
      style: [{ name: "position", value: "absolute" }, { name: "left", value: "8px" },
        { name: "top", value: 0 }, { name: "width", value: "8px" }, { name: "height", value: "8px" },
        { name: "background", value: "#ff0000" }],
      children: [],
    },
  });
  const publish = createLocalHtmlPictureProductPublisher({
    resources,
    html: {
      workers: 1,
      ...(process.env.HYPIT_TEST_CHROME_PATH === undefined
        ? {} : { chromePath: process.env.HYPIT_TEST_CHROME_PATH }),
    },
  });
  const product = await publish({
    requirement: {
      id: "product:html-effect:html-root:picture:effect",
      signal: "picture",
      target: "node",
      producer: "html-effect",
      consumer: "html-root",
      node: "picture:effect",
      temporal: { kind: "signal", regions: temporalRangeRegionSet(domain, {
        start: exactTemporalZero(), end: duration,
      }) },
      pictureDomain,
      spatial: pictureDomain.region,
    },
    binding: {
      product: "product:html-effect:html-root:picture:effect",
      representation: "prepared-picture-sampling",
    },
    program,
    domain,
    pictureDomain,
  });
  verifyPreparedPictureSampling(product);
  assert.equal(product.source.source.mediaType, "video/webm");
  assert.equal(product.source.interpretation.picture.alphaMode, "straight");

  const bytes = await resources.get(product.source.source.resource);
  assert(bytes !== undefined);
  const work = await mkdtemp(join(tmpdir(), "hypit-html-product-test-"));
  try {
    const input = join(work, "product.webm");
    await writeFile(input, bytes);
    const rgba = await run("ffmpeg", [
      "-v", "error", "-c:v", "libvpx-vp9", "-i", input,
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1",
    ], work);
    const pixel = (x: number, y: number) => [...rgba.subarray((y * 16 + x) * 4, (y * 16 + x) * 4 + 4)];
    assert.equal(pixel(2, 2)[3], 0);
    const opaque = pixel(12, 2);
    assert.ok(opaque[0]! > 200, `expected red opaque pixel, received ${JSON.stringify(opaque)}`);
    assert.equal(opaque[3], 255);

    const source = { id: "materialized-effect", outputs: { picture: {
      kind: "signal" as const,
      type: pictureType,
      domain,
      spatialDomain: pictureDomain,
    } } };
    const occurrence = sealOccurrence({
      id: "materialized-effect-use",
      source,
      domain,
      placement: { parent: domain, start: exactTemporalZero(), active: {
        start: exactTemporalZero(), end: duration,
      } },
      selections: { picture: { kind: "signal", mapping: identityTemporalMap(domain) } },
    });
    const avir = sealAudiovisualProgram({
      id: "consume-html-product",
      domain,
      pictureDomain,
      occurrences: { [occurrence.id]: occurrence },
      picture: { root: "root", nodes: {
        root: { kind: "use", occurrence: occurrence.id, output: "picture" },
      } },
    });
    const viewport = sealLocalSpatialDomain({
      id: "consume-html-product-output",
      region: pictureDomain.region,
    });
    const consumer = lowerAudiovisualPictureProgramToHtmlProgram({
      program: avir,
      sources: { sources: [pictureProductHtmlSource(source.id, "picture", product)] },
      output: {
        id: "consume-html-product-output",
        sampling: { frameRate },
        canvas: { width: 16, height: 8, clearColor: "transparent" },
        pictureMapping: {
          target: viewport,
          source: pictureDomain,
          transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
        },
      },
    });
    const consumed = await rasterizeHtmlFrames({
      program: consumer,
      picture: {
        colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
        colorRange: "full", bitDepth: 8, alpha: { mode: "straight" },
      },
      frames: [0],
    }, {
      resources,
      workers: 1,
      ...(process.env.HYPIT_TEST_CHROME_PATH === undefined
        ? {} : { chromePath: process.env.HYPIT_TEST_CHROME_PATH }),
    });
    const consumedBytes = await resources.get(consumed.frames[0]!.artifact.resource);
    assert(consumedBytes !== undefined);
    const consumedPath = join(work, "consumed.png");
    await writeFile(consumedPath, consumedBytes);
    const consumedRgba = await run("ffmpeg", [
      "-v", "error", "-i", consumedPath,
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1",
    ], work);
    const consumedPixel = (x: number, y: number) => [
      ...consumedRgba.subarray((y * 16 + x) * 4, (y * 16 + x) * 4 + 4),
    ];
    assert.equal(consumedPixel(2, 2)[3], 0);
    const consumedOpaque = consumedPixel(12, 2);
    assert.ok(consumedOpaque[0]! > 200, `consumer received ${JSON.stringify(consumedOpaque)}`);
    assert.equal(consumedOpaque[3], 255);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
