import assert from "node:assert/strict";
import test from "node:test";

import type { MarkupAttributeValue, StructuredElement, SurfaceResolvedReference } from "@hypit/markup";
import { narrativeTypes } from "@hypit/narrative";
import { semanticTrackTypes } from "@hypit/semantic-track";
import type { TemporalInstantSpec } from "@hypit/temporal";

import { createTemporalInstantProjection, createTemporalWindowProjection } from "../src/index.js";

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
  }), /semantic reference.*projected point/u);
});
