import { videoContractManifests } from "../../test-support/video-domain.js";
import { registerTypeValidatorFacets } from "@narratage/component-kit";
import { mediaTypes } from "@narratage/media";
import { artifactTypes } from "@narratage/artifact";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  link,
} from "@narratage/core";
import { verifyGraphFragment } from "@narratage/elaborator";
import { TypeValidatorRegistry } from "@narratage/validation";

import {
  mediaPipelineComponents,
  mediaPipelineManifest,
  mediaPipelineTypes,
  decodeSynchronizedMediaSurface,
  synchronizedMediaFragment,
} from "../src/index.js";

test("the media pipeline is an ordinary Fragment over public media contracts", () => {
  const closure = createResolvedClosure([...videoContractManifests, mediaPipelineManifest]);
  const program = link(closure, []);
  verifyGraphFragment(program, synchronizedMediaFragment);
  assert.deepEqual(synchronizedMediaFragment.operations.map((operation) => operation.id), [
    "inspect", "normalize", "select",
  ]);
  assert.equal(synchronizedMediaFragment.exports[0]?.type.name, mediaTypes.synchronized.name);
});

test("the Normalize Surface makes inspection and normalization an explicit author graph branch", async () => {
  const range = { source: "normalize.svml", start: 0, end: 1 };
  const result = await decodeSynchronizedMediaSurface({
    sourceName: range.source,
    element: {
      kind: "element",
      name: "pipeline:Normalize",
      attributes: {
        id: "motion",
        source: { kind: "reference", path: "generated" },
        video: "primary-moving",
        audio: "none",
        "span-authority": "video",
        "frame-rate": "30000/1001",
      },
      children: [],
      range,
    },
    resolveReference: (path) => path === "generated"
      ? { path, ref: { kind: "record", id: path }, type: artifactTypes.blob }
      : undefined,
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  assert.equal(result.fragments[0]?.id, synchronizedMediaFragment.id);
  assert.deepEqual(result.components[0]?.outputs, { media: "motion.media" });
  const request = result.records[0]?.value;
  assert.ok(request?.kind === "inline");
  assert.deepEqual(request.value, {
    contract: "svml.media-selection-request@1",
    video: { mode: "primary-moving" },
    audio: { mode: "none" },
    spanAuthority: "video",
    frameRate: { numerator: 30_000, denominator: 1_001 },
  });
});

test("media identities and selection requests have package-owned semantic validators", () => {
  const registry = new TypeValidatorRegistry();
  for (const component of mediaPipelineComponents) {
    registerTypeValidatorFacets(registry, component.validators);
  }
  assert.ok(registry.resolve(mediaTypes.inspection));
  assert.ok(registry.resolve(mediaTypes.streamSelection));
  assert.ok(registry.resolve(mediaTypes.synchronized));
  assert.ok(registry.resolve(mediaTypes.timelineAudio));
  assert.ok(registry.resolve(mediaTypes.muxed));
  assert.ok(registry.resolve(mediaPipelineTypes.selectionRequest));
  assert.ok(registry.resolve(mediaPipelineTypes.audioProgramPlan));
});
