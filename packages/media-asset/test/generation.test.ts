import assert from "node:assert/strict";
import test from "node:test";

import { generationNodePackagesFromFacets } from "@hypit/generation-graph";
import { mediaTypes, prepareMedia } from "@hypit/media";

import hypitPackage from "../src/activation.js";
import {
  mediaAssetGenerationNode,
  mediaAssetGenerationNodes,
  mediaAssetResourceGenerationNode,
  serializeMediaAssetDocument,
  type MediaAssetDocument,
} from "../src/index.js";

function document(): MediaAssetDocument {
  const timestamp = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } });
  const prepared = prepareMedia({
    id: "interview-media",
    source: { kind: "blob", resource: "res_source", size: 100, mediaType: "video/mp4" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "h264",
      disposition: { default: true, attachedPicture: false },
      startPts: timestamp("0"), endPts: timestamp("10"), decodedUnitCount: 300,
      width: 1920, height: 1080, sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0,
      picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
        colorRange: "limited", bitDepth: 8, alphaMode: "opaque" },
    }] },
    selection: { videoStreamIndex: 0, spanAuthority: "video", picture: {
      colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
    } },
  });
  const { source: _source, ...interpretation } = prepared;
  return {
    format: "hypit.media-asset@1",
    id: "interview",
    media: {
      file: { path: "./interview.mp4", mediaType: "video/mp4" },
      interpretation,
    },
    representations: [],
  };
}

test("Media Asset owns a file-backed PreparedMedia value node", async () => {
  const packages = generationNodePackagesFromFacets(hypitPackage.facets);
  assert.deepEqual(packages, [{ nodes: [mediaAssetGenerationNode, mediaAssetResourceGenerationNode] }]);
  assert.equal(mediaAssetGenerationNode.kind, "value");
  assert.deepEqual(mediaAssetGenerationNode.using, mediaAssetGenerationNodes.media);
  assert.deepEqual(mediaAssetGenerationNode.type, mediaTypes.prepared);

  const reads: string[] = [];
  const resolved: string[] = [];
  const value = await mediaAssetGenerationNode.load({
    node: {
      id: "interview",
      using: mediaAssetGenerationNodes.media,
      inputs: { asset: { value: { path: "assets/interview.media.json" } } },
    },
    project: {
      format: "hypit.generation-graph@1",
      id: "podcast",
      name: "Podcast",
      revision: 0,
      nodes: [],
    },
    inputs: { asset: { path: "assets/interview.media.json" } },
    readAsset(request) {
      reads.push(request.from);
      return new TextEncoder().encode(serializeMediaAssetDocument(document()));
    },
    resolveAsset(request) {
      resolved.push(request.from);
      return { kind: "blob", resource: "res_interview", size: 100, mediaType: request.mediaType };
    },
  });
  assert.deepEqual(reads, ["./assets/interview.media.json"]);
  assert.deepEqual(resolved, ["./assets/interview.mp4"]);
  assert.equal((value as { readonly source: { readonly resource: string } }).source.resource, "res_interview");
});

test("Media Asset also exposes its primary file as an ordinary model input Blob", async () => {
  const resolved: string[] = [];
  const value = await mediaAssetResourceGenerationNode.load({
    node: {
      id: "interview-file",
      using: mediaAssetGenerationNodes.resource,
      inputs: { asset: { value: { path: "assets/interview.media.json" } } },
    },
    project: {
      format: "hypit.generation-graph@1",
      id: "podcast",
      name: "Podcast",
      revision: 0,
      nodes: [],
    },
    inputs: { asset: { path: "assets/interview.media.json" } },
    readAsset: () => new TextEncoder().encode(serializeMediaAssetDocument(document())),
    resolveAsset(request) {
      resolved.push(request.from);
      return { kind: "blob", resource: "res_interview", size: 100, mediaType: request.mediaType };
    },
  });
  assert.deepEqual(resolved, ["./assets/interview.mp4"]);
  assert.deepEqual(value, {
    kind: "blob", resource: "res_interview", size: 100, mediaType: "video/mp4",
  });
});
