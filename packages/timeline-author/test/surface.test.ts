import { programSpaceTypes } from "@hypit/program-space";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import type { StructuredElement, SurfaceResolvedReference } from "@hypit/markup";
import type { SemanticTake } from "@hypit/speech";
import { speechTypes } from "@hypit/speech";
import { decodeTimelineAuthorSurface } from "@hypit/timeline-author";

const take: SemanticTake = {
  narrativeId: "test-narrative",
  media: {
    timeline: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 30 },
    visual: {
      artifact: { kind: "blob", resource: fixtureResource("track:take:video"), size: 1, mediaType: "video/mp4" },
      width: 720,
      height: 1280,
    },
    audio: {
      artifact: { kind: "blob", resource: fixtureResource("track:take:audio"), size: 1, mediaType: "audio/wav" },
    },
  },
  segment: {
    segmentId: "opening",
    startAnchorId: "opening:start",
    endAnchorId: "opening:end",
    startFrame: 0,
    endFrameExclusive: 30,
  },
  tokens: [],
  anchors: [
    { identity: "opening:start", frame: 0 },
    { identity: "opening:end", frame: 30 },
  ],
};

function resolved(path: string): SurfaceResolvedReference | undefined {
  if (path === "clock") return {
    path,
    type: programSpaceTypes.clock,
    ref: { kind: "record", id: path },
    record: { id: path, type: programSpaceTypes.clock, value: { kind: "inline", value: { frameRate: { numerator: 30, denominator: 1 } } } },
  };
  if (path === "opening.take") return {
    path,
    ref: { kind: "record", id: path },
    type: speechTypes.semanticTake,
    record: { id: path, type: speechTypes.semanticTake, value: { kind: "inline", value: take } },
  };
  return undefined;
}

test("Timeline accepts only already-semantic Segment Takes", async () => {
  const element: StructuredElement = {
    kind: "element",
    name: "time:Timeline",
    attributes: { id: "speech", clock: { kind: "reference", path: "clock" } },
    children: [{ kind: "element", name: "time:Take",
      attributes: { source: { kind: "reference", path: "opening.take" } }, children: [], range: { start: 20, end: 60 } }],
    range: { start: 0, end: 70 },
  };
  const output = await decodeTimelineAuthorSurface({
    sourceName: "main.svml",
    element,
    resolveReference: resolved,
    resolveAsset() { throw new Error("Timeline does not resolve assets"); },
  });
  assert.deepEqual(output.components[0]?.outputs, {
    timeline: "speech.timeline",
  });
  assert.deepEqual(output.exports, ["speech.timeline"]);
  assert.deepEqual(output.fragments?.[0]?.exports.map(port => port.name), ["timeline"]);
  assert.equal(output.records.length, 1);
  assert.deepEqual(output.fragments?.[0]?.inputs.map(input => input.name), ["clock", "header", "take-1"]);
});

test("Timeline rejects static placements that do not land on a Clock frame", () => {
  const element: StructuredElement = {
    kind: "element",
    name: "time:Timeline",
    attributes: { id: "speech", clock: { kind: "reference", path: "clock" }, end: "4.25s" },
    children: [],
    range: { start: 0, end: 70 },
  };
  assert.throws(() => decodeTimelineAuthorSurface({
    sourceName: "main.svml",
    element,
    resolveReference: resolved,
    resolveAsset() { throw new Error("Timeline does not resolve assets"); },
  }), /Timeline speech end at 30\/1 fps: Timeline duration 4\.25s must land on an exact frame boundary\./);
});

test("Timeline leaves placements with a runtime-only Clock for Build validation", async () => {
  const element: StructuredElement = {
    kind: "element",
    name: "time:Timeline",
    attributes: { id: "speech", clock: { kind: "reference", path: "runtime-clock" }, end: "4.25s" },
    children: [],
    range: { start: 0, end: 70 },
  };
  const output = await decodeTimelineAuthorSurface({
    sourceName: "main.svml",
    element,
    resolveReference(path) {
      if (path === "runtime-clock") return { path, type: programSpaceTypes.clock, ref: { kind: "component-output", component: "clock", output: "clock" } };
      return resolved(path);
    },
    resolveAsset() { throw new Error("Timeline does not resolve assets"); },
  });
  assert.equal(output.records.length, 1);
});

type BoundaryCase = {
  readonly id: string;
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly end?: string;
  readonly at?: readonly string[];
  readonly invalid: boolean;
};

const boundaryCases: readonly BoundaryCase[] = [
  { id: "legal-30-end", frameRate: { numerator: 30, denominator: 1 }, end: "1s", invalid: false },
  { id: "legal-24-end", frameRate: { numerator: 24, denominator: 1 }, end: "1s", invalid: false },
  { id: "legal-25-end", frameRate: { numerator: 25, denominator: 1 }, end: "1s", invalid: false },
  { id: "legal-ntsc-end", frameRate: { numerator: 30000, denominator: 1001 }, end: "1001ms", invalid: false },
  { id: "legal-30-at", frameRate: { numerator: 30, denominator: 1 }, at: ["0.5s"], invalid: false },
  { id: "legal-24-at", frameRate: { numerator: 24, denominator: 1 }, at: ["125ms"], invalid: false },
  { id: "legal-25-at", frameRate: { numerator: 25, denominator: 1 }, at: ["0.2s"], invalid: false },
  { id: "legal-relative", frameRate: { numerator: 30, denominator: 1 }, at: ["0f", "previous.end+2s"], invalid: false },
  { id: "legal-relative-end", frameRate: { numerator: 30, denominator: 1 }, end: "content.end+2s", invalid: false },
  { id: "invalid-30-end", frameRate: { numerator: 30, denominator: 1 }, end: "0.01s", invalid: true },
  { id: "invalid-24-end", frameRate: { numerator: 24, denominator: 1 }, end: "0.1s", invalid: true },
  { id: "invalid-25-end", frameRate: { numerator: 25, denominator: 1 }, end: "0.1s", invalid: true },
  { id: "invalid-ntsc-end", frameRate: { numerator: 30000, denominator: 1001 }, end: "1s", invalid: true },
  { id: "invalid-30-at", frameRate: { numerator: 30, denominator: 1 }, at: ["0.01s"], invalid: true },
  { id: "invalid-24-at", frameRate: { numerator: 24, denominator: 1 }, at: ["0.1s"], invalid: true },
  { id: "invalid-25-at", frameRate: { numerator: 25, denominator: 1 }, at: ["0.02s"], invalid: true },
  { id: "invalid-relative", frameRate: { numerator: 30, denominator: 1 }, at: ["0f", "previous.end+0.01s"], invalid: true },
  { id: "invalid-relative-end", frameRate: { numerator: 30, denominator: 1 }, end: "content.end+0.01s", invalid: true },
];

function boundaryElement(sample: BoundaryCase): StructuredElement {
  const takes = (sample.at ?? []).map((at, index) => ({
    kind: "element" as const,
    name: "time:Take",
    attributes: { source: { kind: "reference" as const, path: `take-${index}` }, at },
    children: [],
    range: { start: index * 10, end: index * 10 + 9 },
  }));
  return {
    kind: "element",
    name: "time:Timeline",
    attributes: {
      id: sample.id,
      clock: { kind: "reference", path: "clock" },
      ...(sample.end === undefined ? {} : { end: sample.end }),
    },
    children: takes,
    range: { start: 0, end: 100 },
  };
}

test("static Clock preflight covers legal and fractional-frame placements", async () => {
  for (const sample of boundaryCases) {
    const clockValue = { frameRate: sample.frameRate };
    const decode = () => decodeTimelineAuthorSurface({
      sourceName: `${sample.id}.svml`,
      element: boundaryElement(sample),
      resolveReference(path) {
        if (path === "clock") return {
          path, type: programSpaceTypes.clock, ref: { kind: "record", id: path },
          record: { id: path, type: programSpaceTypes.clock, value: { kind: "inline", value: clockValue } },
        };
        return {
          path, type: speechTypes.semanticTake, ref: { kind: "record", id: path },
          record: { id: path, type: speechTypes.semanticTake, value: { kind: "inline", value: take } },
        };
      },
      resolveAsset() { throw new Error("Timeline does not resolve assets"); },
    });
    if (sample.invalid) {
      assert.throws(decode, /exact frame boundary/);
    } else {
      await decode();
    }
  }
});
