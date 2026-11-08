import assert from "node:assert/strict";
import test from "node:test";

import { readHtmlVisual } from "@hypit/html-program";
import { canonicalize } from "@hypit/protocol";
import { createNleLoweringHostFromFacets } from "@hypit/nle";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import { hypitPackage } from "../src/activation.js";
import {
  IDENTITY_PICTURE_TRANSFORM,
  evaluatePictureTransformControl,
  pictureTransformControlFromNleParameters,
  pictureTransformControlOperator,
  pictureTransformNleAuthoring,
  pictureTransformNleSymbol,
  pictureTransformOperator,
} from "../src/index.js";

const at = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});

const moved = {
  ...IDENTITY_PICTURE_TRANSFORM,
  translateX: 120,
  translateY: -40,
  scaleX: -1.5,
  rotationDegrees: 12,
};

test("Picture Transform owns local affine treatment and permits reflection", () => {
  const visual = readHtmlVisual(pictureTransformOperator(moved).program);
  assert.match(visual.html, /\{\{picture\}\}/u);
  assert.match(visual.setup ?? "", /transformOrigin/u);
  assert.match(visual.setup ?? "", /rotate/u);
  assert.equal(pictureTransformOperator(moved).id, "hypit.picture-transform:transform");
  assert.throws(() => pictureTransformOperator({
    ...moved,
    translateX: Number.NaN,
  }), /finite/u);
});

test("Picture Transform evaluates exact-time Controls", () => {
  const domain = sealLocalTemporalDomain({ id: "transform:time", duration: at(2) });
  const control = pictureTransformControlFromNleParameters({
    kind: "keyframes",
    keyframes: [
      { at: at(0), state: IDENTITY_PICTURE_TRANSFORM },
      { at: at(1), state: moved },
    ],
    interpolation: { kind: "linear" },
  }, { itemId: "clip", duration: at(2) });
  assert.deepEqual(control.domain, { ...domain, id: "clip:time" });
  assert.deepEqual(evaluatePictureTransformControl(control, at(1, 2)), {
    ...IDENTITY_PICTURE_TRANSFORM,
    translateX: 60,
    translateY: -20,
    scaleX: -0.25,
    rotationDegrees: 6,
  });
  assert.deepEqual(pictureTransformControlOperator(control).temporalControls, {
    transform: control.domain,
  });
});

test("Picture Transform owns easing instead of asking NLE Core to interpret it", () => {
  const control = pictureTransformControlFromNleParameters({
    kind: "keyframes",
    keyframes: [
      { at: at(0), state: IDENTITY_PICTURE_TRANSFORM },
      { at: at(1), state: moved },
    ],
    interpolation: { kind: "ease-in" },
  }, { itemId: "eased-clip", duration: at(2) });
  assert.equal(evaluatePictureTransformControl(control, at(1, 2)).translateX, 15);
  assert.deepEqual(control.segments[0]?.interpolation, { kind: "ease-in" });
  assert.match(readHtmlVisual(pictureTransformControlOperator(control).program).setup ?? "", /ease-in/u);
});

test("Picture Transform resolves and edits materialized NLE parameters through package facets", () => {
  const parameters = {
    kind: "constant" as const,
    state: IDENTITY_PICTURE_TRANSFORM,
  };
  const effect = {
    id: "pose",
    effect: pictureTransformNleSymbol,
    parameters: canonicalize(parameters),
  };
  const item = { id: "clip", duration: at(2) } as never;
  const project = {} as never;
  const lowering = createNleLoweringHostFromFacets(hypitPackage.facets);
  assert.deepEqual(lowering.resolveEffect(effect, item, project), {
    operator: pictureTransformOperator(IDENTITY_PICTURE_TRANSFORM),
  });

  assert.deepEqual(pictureTransformNleAuthoring.inspect({ effect, item, project } as never),
    canonicalize(parameters));
});
