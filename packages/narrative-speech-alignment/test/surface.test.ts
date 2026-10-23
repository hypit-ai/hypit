import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";
import { narrativeTypes } from "@hypit/narrative";
import { narrativeTemporalProducers } from "@hypit/narrative-temporal";
import { speechEvidenceTypes } from "@hypit/speech-evidence";
import { temporalTypes } from "@hypit/temporal";
import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeSpeechAlignmentSurface,
  speechAlignmentProducers,
} from "@hypit/narrative-speech-alignment";

function authored(
  path: string,
  type: SurfaceResolvedReference["type"],
  value?: unknown,
): SurfaceResolvedReference {
  return {
    path,
    ref: { kind: "record", id: path },
    type,
    ...(value === undefined ? {} : { record: { id: path, type, value: value as never } }),
  };
}

async function decode(source: string, empty: boolean) {
  const refs = new Map<string, SurfaceResolvedReference>([
    ["story", authored("story", narrativeTypes.narrative)],
    ["segment", authored("segment", narrativeTypes.segmentRef, {
      narrativeId: "story", kind: "segment", id: "line", tokenStart: 0, tokenEndExclusive: empty ? 0 : 1,
    })],
    ["domain", authored("domain", temporalTypes.localDomain)],
    ["evidence", authored("evidence", speechEvidenceTypes.transcript)],
  ]);
  return await decodeSpeechAlignmentSurface({
    sourceName: "alignment.svml",
    element: parseStructuredElement({ name: "alignment.svml", text: source }, 0).element,
    resolveReference: (path: string) => refs.get(path),
    resolveAsset: () => { throw new Error("No assets expected"); },
  });
}

test("speech alignment consumes evidence independently of its producer", async () => {
  const output = await decode(
    '<speechalign:Alignment id="line" narrative={story} segment={segment} domain={domain} evidence={evidence}/>',
    false,
  );
  assert.equal(output.components[0]?.fragment.operations[0]?.producer.name,
    speechAlignmentProducers.alignNarrative.name);
  assert.deepEqual(Object.keys(output.components[0]?.inputs ?? {}).sort(),
    ["domain", "evidence", "narrative", "segment"]);
});

test("an empty Segment alignment needs only its authored endpoints and domain", async () => {
  const output = await decode(
    '<speechalign:Alignment id="pause" narrative={story} segment={segment} domain={domain}/>',
    true,
  );
  assert.equal(output.components[0]?.fragment.operations[0]?.producer.name,
    narrativeTemporalProducers.materializeSegmentBoundaries.name);
  assert.deepEqual(Object.keys(output.components[0]?.inputs ?? {}).sort(), ["domain", "narrative", "segment"]);
});
