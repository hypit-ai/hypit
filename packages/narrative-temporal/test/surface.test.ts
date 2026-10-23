import assert from "node:assert/strict";
import test from "node:test";

import { parseStructuredElement, type StructuredSurfaceHandler, type SurfaceResolvedReference } from "@hypit/markup";
import { narrativeTypes } from "@hypit/narrative";
import {
  decodeNarrativeInstantSurface,
  decodeNarrativeProjectionSurface,
  decodeNarrativeWindowSurface,
  narrativeTemporalTypes,
} from "@hypit/narrative-temporal";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

const typed = (path: string, type: SurfaceResolvedReference["type"]): SurfaceResolvedReference =>
  ({ path, type, ref: { kind: "record", id: path } });

const references = new Map<string, SurfaceResolvedReference>([
  ["story", typed("story", narrativeTypes.narrative)],
  ["film", typed("film", timelineTypes.timeline)],
  ["story-time", typed("story-time", narrativeTemporalTypes.narrativeProjection)],
  ["proof", typed("proof", narrativeTypes.selection)],
  ["reveal", typed("reveal", narrativeTypes.moment)],
  ["ending", typed("ending", narrativeTypes.segmentRef)],
  ...["one", "two", "three"].flatMap((id): Array<[string, SurfaceResolvedReference]> => [
    [`${id}.alignment`, typed(`${id}.alignment`, narrativeTemporalTypes.narrativeAlignment)],
    [`${id}.domain`, typed(`${id}.domain`, temporalTypes.localDomain)],
    [`${id}.window`, typed(`${id}.window`, temporalTypes.window)],
  ]),
]);

const decode = (handler: StructuredSurfaceHandler, source: string) => handler({
  sourceName: "projection.svml",
  element: parseStructuredElement({ name: "projection.svml", text: source }, 0).element,
  resolveReference: (path) => references.get(path),
  resolveAsset: async () => { throw new Error("unused"); },
});

test("Projection Surface owns Maps only and publishes one direct value", async () => {
  const output = await decode(decodeNarrativeProjectionSurface, `<semantic:Projection id="story-time" narrative={story} timeline={film}>
    <semantic:Map alignment={one.alignment} domain={one.domain} window={one.window}/>
    <semantic:Map alignment={two.alignment} domain={two.domain} window={two.window}/>
    <semantic:Map alignment={three.alignment} domain={three.domain} window={three.window}/>
  </semantic:Projection>`);
  assert.deepEqual(output.exports, ["story-time"]);
  const fragment = output.components[0]!.fragment;
  assert.equal(fragment.operations.filter((operation) => operation.producer.name === "project-narrative-alignment").length, 3);
  assert.equal(fragment.operations.filter((operation) => operation.producer.name === "combine-narrative-projection-parts").length, 2);
  assert.equal(fragment.operations.at(-1)?.producer.name, "finalize-narrative-projection");

  assert.throws(() => decode(decodeNarrativeProjectionSurface,
    '<semantic:Projection id="story-time" narrative={story} timeline={film}><semantic:Instant id="bad" projection={story-time} at={reveal}/></semantic:Projection>'),
  /Map children only/);
});

test("Narrative Instant reveals one semantic point or explicit interval boundary", async () => {
  const moment = await decode(decodeNarrativeInstantSurface,
    '<semantic:Instant id="claim" projection={story-time} at={reveal}/>');
  assert.deepEqual(moment.exports, ["claim"]);
  assert.equal(moment.components[0]?.fragment.operations[0]?.producer.name, "project-moment-instant");
  assert.equal(Object.hasOwn(moment.components[0]?.inputs ?? {}, "timeline"), false);

  const boundary = await decode(decodeNarrativeInstantSurface,
    '<semantic:Instant id="ending-instant" projection={story-time} at={ending} boundary="end"/>');
  assert.deepEqual(boundary.exports, ["ending-instant"]);
  assert.equal(boundary.components[0]?.fragment.operations[0]?.producer.name, "project-segment-instant");
  assert.throws(() => decode(decodeNarrativeInstantSurface,
    '<semantic:Instant id="bad" projection={story-time} at={ending}/>'), /boundary must be start or end/);
});

test("Narrative Window reveals one complete semantic interval", async () => {
  const output = await decode(decodeNarrativeWindowSurface,
    '<semantic:Window id="proof-window" projection={story-time} during={proof}/>');
  assert.deepEqual(output.exports, ["proof-window", "proof-window.start", "proof-window.end"]);
  assert.equal(output.components[0]?.fragment.operations.some((operation) => operation.producer.name === "compose-window"), true);
  assert.throws(() => decode(decodeNarrativeWindowSurface,
    '<semantic:Window id="bad" projection={story-time} during={reveal}/>'), /Selection or Segment/);
});
