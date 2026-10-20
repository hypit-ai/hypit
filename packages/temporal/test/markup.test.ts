import assert from "node:assert/strict";
import test from "node:test";

import type { MarkupAttributeValue, StructuredElement, SurfaceResolvedReference } from "@hypit/markup";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import {
  createTemporalInstantConstruction,
  createTemporalWindowConstruction,
  resolveTemporalContext,
  resolveTemporalInstantReference,
  resolveTemporalWindowReference,
} from "../src/markup/index.js";

const range = { source: "main.svml", start: 0, end: 1 };
const reference = (path: string): MarkupAttributeValue => ({ kind: "reference", path });
const resolved = (path: string, type: SurfaceResolvedReference["type"]): SurfaceResolvedReference => ({
  path, type, ref: { kind: "record", id: path },
});
const timeline = resolved("timeline", timelineTypes.timeline);
const references = new Map([
  ["timeline", timeline],
  ["start-instant", resolved("start-instant", temporalTypes.instant)],
  ["end-instant", resolved("end-instant", temporalTypes.instant)],
  ["extent", resolved("extent", temporalTypes.extent)],
  ["window", resolved("window", temporalTypes.window)],
]);
const resolveReference = (path: string) => references.get(path);
const element = (attributes: Record<string, MarkupAttributeValue>): StructuredElement => ({
  kind: "element", name: "example:Item", attributes, children: [], range,
});
const inlineValues = (construction: ReturnType<typeof createTemporalWindowConstruction>, typeName: string) => construction.records
  .filter((record) => record.type.name === typeName)
  .map((record) => record.value);

test("absolute author declarations lower without any domain projector", () => {
  const literal = createTemporalWindowConstruction({ id: "literal", element: element({ from: "2.5s", for: "8f" }), timeline, resolveReference });
  assert.deepEqual(inlineValues(literal, "TemporalDuration"), [{ unit: "frames", value: 8 }]);
  assert.deepEqual(inlineValues(literal, "TemporalInstantSpec"), [{
    id: "literal.start", subjectId: "literal",
    projection: { ref: "absolute", at: { unit: "seconds", numerator: 5, denominator: 2 } },
    author: { binding: "from", relation: "direct" },
  }]);
  assert.deepEqual(inlineValues(literal, "TemporalShiftSpec"), [{
    id: "literal.end", subjectId: "literal", direction: 1,
    author: { binding: "for", relation: "after-start" },
  }]);
  assert.equal(literal.components[0]!.fragment.operations.some((operation) => operation.producer.name === "shift-instant"), true);
});

test("resolved Instants compose a Window and an Extent shifts either boundary", () => {
  const between = createTemporalWindowConstruction({ id: "between",
    element: element({ from: reference("start-instant"), until: reference("end-instant") }), timeline, resolveReference });
  assert.deepEqual(between.components[0]!.inputs["start-instant"], references.get("start-instant")!.ref);
  assert.deepEqual(between.components[0]!.inputs["end-instant"], references.get("end-instant")!.ref);

  const after = createTemporalWindowConstruction({ id: "after",
    element: element({ from: reference("start-instant"), for: reference("extent") }), timeline, resolveReference });
  assert.deepEqual(after.components[0]!.inputs.extent, references.get("extent")!.ref);
  assert.deepEqual(inlineValues(after, "TemporalShiftSpec"), [
    { id: "after.end", subjectId: "after", direction: 1 },
  ]);
});

test("resolved Window and Instant references pass directly through", () => {
  const window = resolveTemporalWindowReference({ element: element({ during: reference("window") }), resolveReference });
  assert.deepEqual(window, references.get("window"));
  const instant = resolveTemporalInstantReference({ element: element({ at: reference("start-instant") }), resolveReference });
  assert.deepEqual(instant, references.get("start-instant"));
  assert.throws(() => resolveTemporalWindowReference({ element: element({ during: "timeline" }), resolveReference }), /must be a reference/u);
  assert.throws(() => resolveTemporalInstantReference({ element: element({ at: "2.5s" }), resolveReference }), /must be a reference/u);
});

test("Instant literals use common Timeline arithmetic", () => {
  const at = createTemporalInstantConstruction({ id: "message", element: element({ at: "2.5s" }), timeline, resolveReference });
  assert.deepEqual(inlineValues(at, "TemporalInstantSpec"), [
    { id: "message", subjectId: "message", projection: { ref: "absolute", at: { unit: "seconds", numerator: 5, denominator: 2 } },
      author: { binding: "at", relation: "direct" } },
  ]);
});

test("Temporal context resolves only the absolute Timeline", () => {
  assert.deepEqual(resolveTemporalContext({ element: element({ timeline: reference("timeline") }), resolveReference }), { timeline });
  const clock = resolved("clock", timelineTypes.clock);
  assert.throws(() => resolveTemporalContext({ element: element({ timeline: reference("clock") }), resolveReference: () => clock }), /must reference a Timeline/);
});
