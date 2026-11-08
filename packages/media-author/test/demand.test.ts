import assert from "node:assert/strict";
import test from "node:test";

import { bindAuthorFragment, elaborateGraphFragment } from "@hypit/author";
import { blobManifest, blobTypes } from "@hypit/blob";
import { createResolvedClosure, link, planBuild, sealAuthorGraph } from "@hypit/kernel";
import { temporalManifest } from "@hypit/temporal-graph";

import { fixtureResource } from "../../../test/fixture-resource.js";
import {
  mediaManifest,
  mediaProducers,
  mediaTypes,
  sealMediaSelectionRequest,
} from "@hypit/media";
import { mediaSourceFragment } from "../src/index.js";

const program = link(createResolvedClosure([blobManifest, temporalManifest, mediaManifest]), [{
  id: "shot.resource-input",
  type: blobTypes.blob,
  value: {
    kind: "blob",
    resource: fixtureResource("media-demand:shot"),
    size: 1,
    mediaType: "video/mp4",
  },
}, {
  id: "shot.request",
  type: mediaTypes.selectionRequest,
  value: sealMediaSelectionRequest({
    video: { mode: "primary-moving" },
    audio: { mode: "default-if-present" },
    spanAuthority: "video",
    picture: { mode: "source" },
  }),
}, {
  id: "shot.domain-spec",
  type: mediaTypes.domainSpec,
  value: { id: "shot" },
}]);

const instance = elaborateGraphFragment(program, mediaSourceFragment, {
  id: "shot",
  inputs: {
    resource: { kind: "record", id: "shot.resource-input" },
    request: { kind: "record", id: "shot.request" },
    domain: { kind: "record", id: "shot.domain-spec" },
  },
});
const contribution = bindAuthorFragment(instance, {
  default: "shot",
  resource: "shot.resource",
  source: "shot.source",
  domain: "shot.domain",
  extent: "shot.extent",
});
const graph = sealAuthorGraph({ outputs: contribution.outputs, operations: contribution.operations });

function producerNames(target: string): readonly string[] {
  return planBuild(program, graph, [target]).plan.steps.map((step) => step.producer.name).sort();
}

test("a Media Resource target naturally prunes the prepared branch", () => {
  assert.deepEqual(producerNames("shot.resource"), [mediaProducers.resource.name]);
});

test("a prepared Media target demands inspect, select and prepare without the direct Resource projection", () => {
  assert.deepEqual(producerNames("shot.source"), [
    mediaProducers.inspect.name,
    mediaProducers.prepare.name,
    mediaProducers.select.name,
  ].sort());
});

test("Media owns its Extent projection instead of depending on a generic Temporal Producer", () => {
  assert.deepEqual(producerNames("shot.extent"), [
    mediaProducers.extent.name,
    mediaProducers.inspect.name,
    mediaProducers.localDomain.name,
    mediaProducers.prepare.name,
    mediaProducers.select.name,
  ].sort());
});
