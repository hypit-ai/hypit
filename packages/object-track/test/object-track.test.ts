import assert from "node:assert/strict";
import test from "node:test";

import { identityTemporalMap, sealLocalTemporalDomain, exactTemporalValue } from "@hypit/temporal/algebra";

import {
  objectTrackMediaRepresentationPackage,
  objectTrackSampleAt,
  objectTrackTypes,
  parseObjectTrackDocument,
  serializeObjectTrackDocument,
  type ObjectTrackDocument,
} from "../src/index.js";

const at = (value: number) => exactTemporalValue({ numerator: BigInt(value), denominator: 10n });
const domain = sealLocalTemporalDomain({ id: "clip:object-time", duration: at(30) });
const document: ObjectTrackDocument = {
  format: "hypit.object-track@1",
  id: "subjects",
  domain,
  tracks: [{
    id: "speaker",
    label: "Speaker",
    samples: [
      { at: at(0), region: { x: 0.2, y: 0.1, width: 0.3, height: 0.5 } },
      { at: at(10), region: { x: 0.25, y: 0.1, width: 0.3, height: 0.5 } },
      { at: at(20), region: null },
    ],
  }],
};

test("Object Track is a strict editable file without analyzer metadata", () => {
  const encoded = serializeObjectTrackDocument(document);
  assert.deepEqual(parseObjectTrackDocument(encoded), document);
  assert.doesNotMatch(encoded, /confidence|authority|provider|analyzer|score/iu);
  assert.deepEqual(objectTrackSampleAt(document, "speaker", at(15), "previous"), document.tracks[0]!.samples[1]);
  assert.equal(objectTrackSampleAt(document, "speaker", at(15), "exact"), undefined);
});

test("Object Track Representation closes document time against the media binding", async () => {
  const owner = objectTrackMediaRepresentationPackage.representations[0]!;
  assert.deepEqual(owner.type, objectTrackTypes.document);
  const opened = await owner.open({
    asset: {} as never,
    representation: {
      id: "objects",
      type: objectTrackTypes.document,
      document: { kind: "blob", resource: "res_objects", size: 1, mediaType: "application/json" },
      resources: {},
      binding: {
        temporal: { mapToMedia: identityTemporalMap(domain) },
        picture: { member: "picture", space: "media-display-normalized" },
      },
    },
    read: async () => new TextEncoder().encode(serializeObjectTrackDocument(document)),
  });
  assert.deepEqual(opened, document);
});
