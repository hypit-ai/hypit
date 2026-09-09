import assert from "node:assert/strict";
import test from "node:test";

import type { MarkupAttributeValue, StructuredElement, SurfaceResolvedReference } from "@hypit/markup";
import { narrativeTypes } from "@hypit/narrative";
import { programSpaceTypes } from "@hypit/program-space";
import { semanticTrackTypes } from "@hypit/semantic-track";
import type { TemporalInstantSpec } from "@hypit/temporal";

import { createTemporalInstantProjection, createTemporalWindowProjection, resolveTemporalContext } from "../src/index.js";

const range = { source: "main.svml", start: 0, end: 1 };
const reference = (path: string): MarkupAttributeValue => ({ kind: "reference", path });
const resolved = (path: string, type: SurfaceResolvedReference["type"]): SurfaceResolvedReference => ({
  path, type, ref: { kind: "record", id: path },
});

const semantic = resolved("semantic", semanticTrackTypes.track);
const references = new Map([
  ["selection", resolved("selection", narrativeTypes.selection)],
  ["segment", resolved("segment", narrativeTypes.excerpt)],
  ["moment", resolved("moment", narrativeTypes.moment)],
]);
const resolveReference = (path: string) => references.get(path);
const element = (attributes: Record<string, MarkupAttributeValue>): StructuredElement => ({
  kind: "element", name: "example:Item", attributes, children: [], range,
});
const specs = (projection: ReturnType<typeof createTemporalWindowProjection>) => projection.records
  .filter((record) => record.type.name === "TemporalInstantSpec")
  .map((record) => record.value.kind === "inline" ? record.value.value as unknown as TemporalInstantSpec : undefined);

test("the author bridge owns the four Window forms and the explicit Instant fallback", () => {
  assert.deepEqual(specs(createTemporalWindowProjection({
    id: "during", element: element({ during: reference("selection") }), semantic, resolveReference,
  })).map((spec) => spec?.authority), [
    { kind: "semantic", boundary: "start" },
    { kind: "semantic", boundary: "end" },
  ]);

  assert.deepEqual(specs(createTemporalWindowProjection({
    id: "at", element: element({ at: reference("moment"), for: "8f" }), semantic, resolveReference,
  })).map((spec) => spec?.authority), [
    { kind: "semantic", boundary: "cue" },
    { kind: "parameter", binding: "for", relation: "after-start" },
  ]);

  assert.deepEqual(specs(createTemporalWindowProjection({
    id: "until", element: element({ until: reference("moment"), for: "8f" }), semantic, resolveReference,
  })).map((spec) => spec?.authority), [
    { kind: "parameter", binding: "for", relation: "before-end" },
    { kind: "semantic", boundary: "cue" },
  ]);

  assert.deepEqual(specs(createTemporalWindowProjection({
    id: "explicit",
    element: element({ start: "moment.cue+3f", end: "program.end", moment: reference("moment") }),
    semantic, resolveReference,
  })).map((spec) => spec?.authority), [
    { kind: "parameter", binding: "start", relation: "direct" },
    { kind: "parameter", binding: "end", relation: "direct" },
  ]);

  const instant = createTemporalInstantProjection({
    id: "fallback", element: element({ instant: "moment.cue+3f", moment: reference("moment") }),
    semantic, resolveReference,
  });
  assert.deepEqual(specs(instant as ReturnType<typeof createTemporalWindowProjection>)[0]?.authority,
    { kind: "parameter", binding: "instant", relation: "direct" });
  assert.throws(() => createTemporalInstantProjection({
    id: "ambiguous", element: element({ at: "moment.cue+3f" }), semantic, resolveReference,
  }), /exact duration/u);
});

test("authored at/for projects on a declared clock while Script events keep their semantic dependency", () => {
  const space = resolved("animation", programSpaceTypes.programSpace);
  const at = createTemporalInstantProjection({ id: "message", element: element({ at: "2.5s" }), space, resolveReference });
  const absolute = specs(at as ReturnType<typeof createTemporalWindowProjection>)[0]!;
  assert.deepEqual(absolute.projection, { ref: "absolute", at: { unit: "seconds", numerator: 5, denominator: 2 } });
  assert.deepEqual(absolute.authority, { kind: "parameter", binding: "at", relation: "direct" });
  assert.equal(at.fragments.some(fragment => fragment.inputs.some(input => input.name === "semantic")), false);

  const window = specs(createTemporalWindowProjection({
    id: "bubble", element: element({ at: "2.5s", for: "8f" }), space, resolveReference,
  }));
  assert.deepEqual(window[1]?.projection, { ref: "absolute", at: { unit: "seconds", numerator: 5, denominator: 2 }, offset: { unit: "frames", value: 8 } });
  const bound = createTemporalInstantProjection({ id: "message", element: element({ at: reference("moment") }), semantic, resolveReference });
  assert.equal(bound.fragments.some(fragment => fragment.inputs.some(input => input.name === "semantic")), true);
  assert.throws(() => createTemporalInstantProjection({ id: "message", element: element({ at: reference("moment") }), space, resolveReference }), /semantic/u);

  const context = resolveTemporalContext({ element: element({ space: reference("animation") }), resolveReference: path => path === "animation" ? space : undefined });
  assert.deepEqual(context, { space });
});
