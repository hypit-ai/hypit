import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { prepareMedia } from "@hypit/media";
import {
  serializeMediaAssetDocument,
  type MediaAssetDocument,
} from "@hypit/media-asset";
import { createMediaProjectObjectOwnerFacet } from "@hypit/media-asset/node";
import { createProductionContextHostFromFacets } from "@hypit/production-context";

import {
  applyNleTransaction,
  createNleProject,
  nleLinearTimeMapping,
  serializeNleProject,
} from "../src/index.js";
import { createNleProjectObjectOwnerFacet } from "../src/node/index.js";

function mediaDocument(): MediaAssetDocument {
  const prepared = prepareMedia({
    id: "shared-media",
    source: { kind: "blob", resource: "res_project-context-media", size: 1, mediaType: "image/png" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "png",
      disposition: { default: true, attachedPicture: true },
      startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      endPts: { ticks: "1", timeBase: { numerator: 1, denominator: 1 } },
      decodedUnitCount: 1,
      width: 1, height: 1,
      sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0,
      picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
        colorRange: "full", bitDepth: 8, alphaMode: "opaque" },
    }] },
    selection: { videoStreamIndex: 0, spanAuthority: "video", picture: {
      colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
      colorRange: "full", bitDepth: 8, alphaMode: "opaque",
    } },
  });
  const { source: _source, ...interpretation } = prepared;
  return {
    format: "hypit.media-asset@1",
    id: "shared-media",
    media: { file: { path: "./shared.png", mediaType: "image/png" }, interpretation },
    representations: [],
  };
}

function edit(id: string, name: string, includeMedia: boolean) {
  const second = { ticks: "1", timeBase: { numerator: 1, denominator: 1 } } as const;
  return applyNleTransaction(createNleProject({ id, name }), { revision: 0, commands: [{
    kind: "track.add",
    track: {
      id: "picture", name: "Picture", kind: "picture", muted: false,
      items: includeMedia ? [{
        id: "shared", kind: "present", source: "media",
        asset: { path: "../media/shared/shared.media.json" },
        start: { ticks: "0", timeBase: second.timeBase }, duration: second,
        sourceTime: nleLinearTimeMapping(second), enabled: true,
        picture: { layout: { x: 0, y: 0, width: 1, height: 1, fit: "fill" } },
      }] : [],
    },
  }] });
}

test("Media and multiple NLE owners build one Project Context without Bench coupling", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-production-context-"));
  try {
    await mkdir(join(directory, "media", "shared"), { recursive: true });
    await mkdir(join(directory, "episode"), { recursive: true });
    await writeFile(join(directory, "media", "shared", "shared.media.json"),
      serializeMediaAssetDocument(mediaDocument()));
    await writeFile(join(directory, "episode", "rough.nle.json"),
      serializeNleProject(edit("rough", "Rough cut", false)));
    await writeFile(join(directory, "episode", "final.nle.json"),
      serializeNleProject(edit("final", "Final cut", true)));

    const host = createProductionContextHostFromFacets([
      createMediaProjectObjectOwnerFacet(),
      createNleProjectObjectOwnerFacet(),
    ]);
    const context = await host.project(directory);

    assert.deepEqual(context.objects.map((value) => value.label), [
      "shared-media", "Final cut", "Rough cut",
    ]);
    const final = context.objects.find((value) => value.label === "Final cut");
    assert.deepEqual(final?.references, [{
      path: "media/shared/shared.media.json",
      format: "hypit.media-asset@1",
    }]);
    assert.deepEqual(context.unresolved, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
