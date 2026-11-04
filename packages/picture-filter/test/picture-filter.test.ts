import assert from "node:assert/strict";
import test from "node:test";

import { readHtmlVisual } from "@hypit/html-program";
import { canonicalize } from "@hypit/hypit/protocol";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import {
  IDENTITY_PICTURE_FILTER,
  evaluatePictureFilterControl,
  pictureFilterComponent,
  pictureFilterControlOperator,
  pictureFilterOperator,
  pictureFilterProducers,
} from "../src/index.js";

const at = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});

const domain = sealLocalTemporalDomain({ id: "filter:time", duration: at(1) });
const faded = { ...IDENTITY_PICTURE_FILTER, opacity: 0, blurRadius: 12 };
const control = {
  domain,
  segments: [{
    range: { start: at(0), end: at(1) },
    from: IDENTITY_PICTURE_FILTER,
    to: faded,
    interpolation: { kind: "linear" as const },
  }],
};

test("Picture Filter publishes static and controlled unary Picture Operators", async () => {
  const staticProducer = pictureFilterComponent.producers.find((candidate) =>
    candidate.producer.name === pictureFilterProducers.operator.name)!;
  const staticResult = await staticProducer.handler({
    inputs: { state: { value: canonicalize(IDENTITY_PICTURE_FILTER) } },
  } as never);
  assert.equal(staticResult.kind, "output");
  assert.deepEqual(staticResult.value, pictureFilterOperator(IDENTITY_PICTURE_FILTER));

  const controlProducer = pictureFilterComponent.producers.find((candidate) =>
    candidate.producer.name === pictureFilterProducers.controlOperator.name)!;
  const controlResult = await controlProducer.handler({
    inputs: { control: { value: canonicalize(control) } },
  } as never);
  assert.equal(controlResult.kind, "output");
  assert.deepEqual(controlResult.value, pictureFilterControlOperator(control));
});

test("Picture Filter uses the generic TemporalControl instead of private normalized keyframes", () => {
  const operator = pictureFilterControlOperator(control);
  assert.deepEqual(operator.inputs, ["picture"]);
  assert.deepEqual(operator.temporalControls, { filter: domain });
  assert.match(readHtmlVisual(operator.program).html, /\{\{picture\}\}/u);

  assert.deepEqual(evaluatePictureFilterControl(control, at(1, 2)), {
    ...IDENTITY_PICTURE_FILTER,
    opacity: 0.5,
    blurRadius: 6,
  });
});

test("Picture Filter owns only photometric state; placement remains SpatialMap", () => {
  assert.deepEqual(Object.keys(IDENTITY_PICTURE_FILTER).sort(), [
    "blurRadius", "brightness", "contrast", "grayscale", "hue",
    "invert", "opacity", "saturation", "sepia",
  ].sort());
  assert.equal(pictureFilterOperator(IDENTITY_PICTURE_FILTER).id, "hypit.picture-filter:filter");
  assert.throws(() => pictureFilterOperator({
    ...IDENTITY_PICTURE_FILTER,
    opacity: 2,
  }), /between 0 and 1/u);
});
