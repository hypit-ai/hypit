import assert from "node:assert/strict";
import test from "node:test";

import { readHtmlAdjustment } from "@hypit/html-program";

import {
  blurTreatment,
  colorTreatment,
  opacityTreatment,
  transformTreatment,
  visualTreatmentAuthorDeclarations,
  visualTreatmentMarkupDeclarations,
} from "../src/index.js";
import { visualTreatmentStudioParameterCompanions } from "../src/studio.js";

test("the official package publishes one declaration per foundational unary Picture effect", () => {
  assert.deepEqual(visualTreatmentMarkupDeclarations.map(({ tag }) => tag), [
    "Transform", "Opacity", "Blur", "Color",
  ]);
  assert.deepEqual(
    visualTreatmentAuthorDeclarations.map(({ declaration }) => declaration),
    visualTreatmentMarkupDeclarations.map(({ name }) => name),
  );
  assert.deepEqual(
    visualTreatmentStudioParameterCompanions.map(({ match }) => match.declaration),
    visualTreatmentMarkupDeclarations.map(({ name }) => name),
  );
});

test("each effect owns one explicit renderer programme and complete states", () => {
  assert.deepEqual(readHtmlAdjustment(transformTreatment([{
    at: 0, x: 12, y: -4, scaleX: 1.2, scaleY: 0.8, rotation: 15, originX: 0.25, originY: 0.75,
  }])).keyframes, [{
    at: 0,
    filter: "none",
    opacity: 1,
    transform: "translate(12px, -4px) rotate(15deg) scale(1.2, 0.8)",
    transformOrigin: "25% 75%",
  }]);
  assert.equal(readHtmlAdjustment(opacityTreatment([{ at: 0, value: 0.4 }])).keyframes[0]?.opacity, 0.4);
  assert.equal(readHtmlAdjustment(blurTreatment([{ at: 0, radius: 8 }])).keyframes[0]?.filter, "blur(8px)");
});

test("Color defines its internal operation order instead of merging unrelated effects", () => {
  const effect = colorTreatment([{
    at: 0, brightness: 1.1, contrast: 1.2, saturation: 0.9, hue: 8,
    grayscale: 0, sepia: 0.1, invert: 0,
  }]);
  assert.equal(readHtmlAdjustment(effect).keyframes[0]?.filter,
    "brightness(1.1) contrast(1.2) saturate(0.9) hue-rotate(8deg) grayscale(0) sepia(0.1) invert(0)");
});

test("animated effects use occurrence-local normalized endpoints", () => {
  const effect = blurTreatment([
    { at: 0, radius: 0, easing: "ease-in-out" },
    { at: 0.5, radius: 24 },
    { at: 1, radius: 0 },
  ]);
  assert.deepEqual(readHtmlAdjustment(effect).keyframes.map(({ at, filter, easing }) => ({ at, filter, easing })), [
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
