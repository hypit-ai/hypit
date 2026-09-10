import assert from "node:assert/strict";
import test from "node:test";
import type { StudioInspectorField } from "@hypit/studio-adapter";
import { parameterAuthorValue, parameterNumber, parameterOption, serializeParameterValue, validateParameterValue } from "../src/parameter-values.js";

const field = (overrides: Partial<StudioInspectorField>): StudioInspectorField => ({
  id: "width", binding: "frame.width", label: "Width", domain: "where", section: { id: "size", label: "Size" },
  control: "number", value: "78%", language: "svml", source: { path: "main.svml", range: { start: 0, end: 3 }, preimage: "78%" },
  number: { suffixes: ["%", "px"] }, ...overrides,
});

test("numeric editing separates units and restores the authored unit without converting it", () => {
  for (const [value, suffix] of [["78%", "%"], ["78px", "px"]]) {
    const held = field({ value: value! });
    assert.deepEqual(parameterNumber(held.value, held.number), { value: 78, suffix });
    assert.equal(parameterAuthorValue(held, 42.5), `42.5${suffix}`);
    assert.throws(() => parameterAuthorValue(held, "42.5%"), /finite number/u);
  }
  assert.throws(() => parameterNumber("auto", { suffixes: ["%", "px"] }), /unit/u);
  assert.throws(() => parameterNumber(""), /numeric/u);
  const seconds = field({ value: "0.25s", number: { suffixes: ["ms", "s", "f"] } });
  assert.equal(parameterAuthorValue(seconds, .5), "0.5s");
});

test("percentage display and schema validation apply on opposite sides of the translation", () => {
  const opacity = field({ value: .78, language: "svs", unit: "%", number: { scale: 100, minimum: 0, maximum: 100 },
    schema: { kind: "number", minimum: 0, maximum: 1 } });
  assert.equal(parameterNumber(opacity.value, opacity.number).value, 78);
  assert.equal(parameterNumber(.55, opacity.number).value, 55);
  assert.equal(parameterAuthorValue(opacity, 55), .55);
  const value = parameterAuthorValue(opacity, 42);
  assert.equal(value, .42);
  validateParameterValue(value, opacity.schema!, "Opacity");
  assert.equal(serializeParameterValue(value, "svs"), "0.42");
  assert.throws(() => parameterAuthorValue(opacity, 101), /at most/u);
  assert.throws(() => parameterAuthorValue(opacity, NaN), /finite/u);
});

test("rich options preserve values independently of labels and visual hints", () => {
  assert.deepEqual(parameterOption("loop"), { value: "loop", label: "loop" });
  const font = { value: "editorial", label: "Editorial Serif", description: "Project headline face", preview: { kind: "font", family: "Project Serif" } } as const;
  assert.equal(parameterOption(font).value, "editorial");
  assert.equal(parameterOption({ value: 700, label: "Bold" }).value, 700);
});

test("SVML parameter text escapes attribute delimiters while SVS keeps its own codec", () => {
  const text = 'Say "hello" & <look> at Bob\'s';
  assert.equal(serializeParameterValue(text, "svml"), "Say &quot;hello&quot; &amp; &lt;look&gt; at Bob&apos;s");
  assert.equal(serializeParameterValue(text, "svs"), JSON.stringify(text));
});
