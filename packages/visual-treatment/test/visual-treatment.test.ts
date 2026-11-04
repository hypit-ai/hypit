import assert from "node:assert/strict";
import test from "node:test";

import { HTML_VISUAL_FORMAT, readHtmlVisual } from "@hypit/html-program";
import { canonicalize } from "@hypit/hypit/protocol";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import {
  blurOperator,
  blurTreatment,
  colorOperator,
  colorTreatment,
  opacityOperator,
  opacityTreatment,
  readVisualTreatmentHtml,
  transformOperator,
  transformTreatment,
  treatmentOperator,
  visualTreatmentComponent,
  visualTreatmentProducers,
} from "../src/index.js";

const domain = sealLocalTemporalDomain({ id: "treatment:time", duration: exactTemporalValue({
  numerator: 3n, denominator: 1n,
}) });

test("the typed Producer publishes every treatment as a closed unary Picture Operator", async () => {
  const transform = [{
    at: 0, x: 12, y: -4, scaleX: 1.2, scaleY: 0.8, rotation: 15, originX: 0.25, originY: 0.75,
  }] as const;
  const color = [{
    at: 0, brightness: 1.1, contrast: 1.2, saturation: 0.9, hue: 8, grayscale: 0, sepia: 0.1, invert: 0,
  }] as const;
  const specs = [
    { kind: "transform", states: transform },
    { kind: "opacity", states: [{ at: 0, value: 0.4 }] },
    { kind: "blur", states: [{ at: 0, radius: 8 }] },
    { kind: "color", states: color },
  ] as const;
  const producer = visualTreatmentComponent.producers.find((candidate) =>
    candidate.producer.name === visualTreatmentProducers.operator.name)!;
  for (const spec of specs) {
    const result = await producer.handler({ inputs: {
      spec: { value: canonicalize(spec) }, domain: { value: canonicalize(domain) },
    } } as never);
    assert.equal(result.kind, "output");
    assert.deepEqual(result.value, treatmentOperator(spec, domain));
  }
});

test("every treatment owns one Picture port and carries terminal-executable HTML", () => {
  const operators = [
    transformOperator(domain, [{ at: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, originX: 0.5, originY: 0.5 }]),
    opacityOperator(domain, [{ at: 0, value: 0.5 }]),
    blurOperator(domain, [{ at: 0, radius: 4 }]),
    colorOperator(domain, [{ at: 0, brightness: 1, contrast: 1, saturation: 1, hue: 0, grayscale: 0, sepia: 0, invert: 0 }]),
  ];
  assert.deepEqual(operators.map(({ id }) => id), [
    "hypit.visual-treatment:transform",
    "hypit.visual-treatment:opacity",
    "hypit.visual-treatment:blur",
    "hypit.visual-treatment:color",
  ]);
  for (const operator of operators) {
    assert.deepEqual(operator.inputs, ["picture"]);
    assert.deepEqual(operator.temporalControls, { progress: domain });
    assert.equal(operator.program.format, HTML_VISUAL_FORMAT);
    assert.match(readHtmlVisual(operator.program).html, /\{\{picture\}\}/u);
  }
});

test("each effect owns one explicit renderer programme and complete states", () => {
  assert.deepEqual(readVisualTreatmentHtml(transformTreatment([{
    at: 0, x: 12, y: -4, scaleX: 1.2, scaleY: 0.8, rotation: 15, originX: 0.25, originY: 0.75,
  }])).keyframes, [{
    at: 0,
    filter: "none",
    opacity: 1,
    transform: "translate(12px, -4px) rotate(15deg) scale(1.2, 0.8)",
    transformOrigin: "25% 75%",
  }]);
  assert.equal(readVisualTreatmentHtml(opacityTreatment([{ at: 0, value: 0.4 }])).keyframes[0]?.opacity, 0.4);
  assert.equal(readVisualTreatmentHtml(blurTreatment([{ at: 0, radius: 8 }])).keyframes[0]?.filter, "blur(8px)");
});

test("Color defines its internal operation order instead of merging unrelated effects", () => {
  const effect = colorTreatment([{
    at: 0, brightness: 1.1, contrast: 1.2, saturation: 0.9, hue: 8,
    grayscale: 0, sepia: 0.1, invert: 0,
  }]);
  assert.equal(readVisualTreatmentHtml(effect).keyframes[0]?.filter,
    "brightness(1.1) contrast(1.2) saturate(0.9) hue-rotate(8deg) grayscale(0) sepia(0.1) invert(0)");
});

test("animated effects use occurrence-local normalized endpoints", () => {
  const effect = blurTreatment([
    { at: 0, radius: 0, easing: "ease-in-out" },
    { at: 0.5, radius: 24 },
    { at: 1, radius: 0 },
  ]);
  assert.deepEqual(readVisualTreatmentHtml(effect).keyframes.map(({ at, filter, easing }) => ({ at, filter, easing })), [
    { at: 0, filter: "blur(0px)", easing: "ease-in-out" },
    { at: 0.5, filter: "blur(24px)", easing: undefined },
    { at: 1, filter: "blur(0px)", easing: undefined },
  ]);
});

test("effect constructors reject invalid state at the effect boundary", () => {
  assert.throws(() => opacityTreatment([{ at: 0, value: 1.1 }]), /between 0 and 1/u);
  assert.throws(() => blurTreatment([{ at: 0, radius: -1 }]), /must not be negative/u);
  assert.doesNotThrow(() => transformTreatment([{
    at: 0, x: 0, y: 0, scaleX: -1, scaleY: 0, rotation: 0, originX: -0.5, originY: 1.5,
  }]));
  assert.throws(() => blurTreatment([{ at: 0.5, radius: 0 }, { at: 1, radius: 4 }]), /include progress 0 and 1/u);
});
