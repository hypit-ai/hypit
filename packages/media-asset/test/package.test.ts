import assert from "node:assert/strict";
import test from "node:test";

import {
  createMediaRepresentationFacet,
  createMediaRepresentationHostFromFacets,
} from "../src/index.js";
import type { ResolvedMediaAsset } from "../src/index.js";

const speechType = { module: { name: "@example/speech", version: "1" }, name: "Transcript" } as const;
const objectsType = { module: { name: "@example/object-tracks", version: "1" }, name: "TrackedObjects" } as const;

function asset(): ResolvedMediaAsset {
  const source = { kind: "blob" as const, resource: "res_media" as const, size: 1, mediaType: "video/mp4" };
  return {
    id: "interview",
    media: {
      id: "interview-media",
      source,
      picture: {
        kind: "constant",
        streamIndex: 0,
        interpretation: {
          codedWidth: 1,
          codedHeight: 1,
          sampleAspectRatio: { numerator: 1, denominator: 1 },
          rotationDegrees: 0,
          picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
            colorRange: "full", bitDepth: 8, alphaMode: "opaque" },
        },
      },
    },
    representations: [{
      id: "speech",
      type: speechType,
      document: { kind: "blob", resource: "res_speech" as const, size: 6, mediaType: "application/json" },
      resources: {},
      binding: { picture: { member: "picture", space: "media-display-normalized" } },
    }, {
      id: "objects",
      type: objectsType,
      document: { kind: "blob", resource: "res_objects" as const, size: 7, mediaType: "application/json" },
      resources: {
        masks: { kind: "blob", resource: "res_masks" as const, size: 5, mediaType: "video/x-matroska" },
      },
      binding: { picture: { member: "picture", space: "media-display-normalized" } },
    }],
  };
}

test("installed packages open only their exact Representation Type", async () => {
  const facets = [
    createMediaRepresentationFacet({ representations: [{
      type: speechType,
      open: async ({ representation, read }) => ({
        kind: "speech",
        document: new TextDecoder().decode(await read(representation.document)),
      }),
    }] }),
    createMediaRepresentationFacet({ representations: [{
      type: objectsType,
      open: async ({ representation, read }) => ({
        kind: "objects",
        masks: new TextDecoder().decode(await read(representation.resources.masks!)),
      }),
    }] }),
  ];
  const bytes = new Map([["res_speech", "speech"], ["res_masks", "masks"]]);
  const host = createMediaRepresentationHostFromFacets(facets);
  const read = async (resource: { readonly resource: string }) =>
    new TextEncoder().encode(bytes.get(resource.resource) ?? "");
  assert.deepEqual(await host.open(asset(), "speech", read), { kind: "speech", document: "speech" });
  assert.deepEqual(await host.open(asset(), "objects", read), { kind: "objects", masks: "masks" });
});

test("missing and duplicate Representation owners fail without affecting the asset file", async () => {
  const value = asset();
  const host = createMediaRepresentationHostFromFacets([]);
  await assert.rejects(() => host.open(value, "objects", async () => new Uint8Array()), /is not installed/u);
  assert.equal(value.representations.length, 2);
  assert.throws(() => createMediaRepresentationHostFromFacets([
    createMediaRepresentationFacet({ representations: [{ type: speechType, open: () => null }] }),
    createMediaRepresentationFacet({ representations: [{ type: speechType, open: () => null }] }),
  ]), /multiple owners/u);
});
