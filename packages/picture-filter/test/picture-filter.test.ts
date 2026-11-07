import assert from "node:assert/strict";
import test from "node:test";

import { pictureType, resolveTemporalControlPosition } from "@hypit/audiovisual";
import { readHtmlVisual } from "@hypit/html-program";
import { canonicalize } from "@hypit/hypit/protocol";
import {
  applyNleTransaction,
  commitNleEdit,
  createNleAuthoringHostFromFacets,
  createNleEditSession,
  createNleLoweringHostFromFacets,
  createNlePackageFacet,
  createNleProject,
  findNleItem,
  lowerNleProjectToAudiovisual,
  parseNleProject,
  serializeNleProject,
  undoNleEdit,
} from "@hypit/nle";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import {
  IDENTITY_PICTURE_FILTER,
  evaluatePictureFilterControl,
  pictureFilterControlFromNleParameters,
  pictureFilterComponent,
  pictureFilterControlOperator,
  pictureFilterOperator,
  pictureFilterNleSymbol,
  pictureFilterProducers,
} from "../src/index.js";
import { hypitPackage as pictureFilterHypitPackage } from "../src/activation.js";

const at = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});

const domain = sealLocalTemporalDomain({ id: "filter:time", duration: at(1) });
const faded = { ...IDENTITY_PICTURE_FILTER, opacity: 0, blurRadius: 12 };
const animatedParameters = {
  kind: "frames" as const,
  frames: [
    { atFrame: 0, state: faded },
    { atFrame: 30, state: IDENTITY_PICTURE_FILTER },
  ],
  interpolation: { kind: "linear" as const },
};
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

test("the package resolves a materialized NLE Effect through its ordinary state", () => {
  const effect = {
    id: "faded", effect: pictureFilterNleSymbol,
    parameters: canonicalize({ kind: "constant", state: faded }),
  };
  const resolved = createNleLoweringHostFromFacets(pictureFilterHypitPackage.facets)
    .resolveEffect(effect, { durationFrames: 60 } as never, {
      project: { frameRate: { numerator: 30, denominator: 1 } },
    } as never);
  assert.deepEqual(resolved, { operator: pictureFilterOperator(faded) });
});

test("the package compiles its own NLE frame parameters into the shared exact Control", () => {
  const compiled = pictureFilterControlFromNleParameters(animatedParameters, {
    itemId: "clip",
    durationFrames: 60,
    frameRate: { numerator: 30, denominator: 1 },
  });
  assert.equal(compiled.domain.id, "clip:time");
  assert.deepEqual(compiled.domain.duration, at(2));
  assert.deepEqual(evaluatePictureFilterControl(compiled, at(1, 2)), {
    ...IDENTITY_PICTURE_FILTER,
    opacity: 0.5,
    blurRadius: 6,
  });
  assert.deepEqual(evaluatePictureFilterControl(compiled, at(3, 2)), IDENTITY_PICTURE_FILTER);
  assert.throws(() => pictureFilterControlFromNleParameters({
    ...animatedParameters,
    frames: [{ atFrame: 1, state: faded }],
  }, {
    itemId: "clip",
    durationFrames: 60,
    frameRate: { numerator: 30, denominator: 1 },
  }), /begin at Item-local frame 0/u);
  assert.throws(() => pictureFilterControlFromNleParameters(animatedParameters, {
    itemId: "trimmed-clip",
    durationFrames: 30,
    frameRate: { numerator: 30, denominator: 1 },
  }), /must lie inside the Item duration/u);
});

test("an animated NLE Effect round-trips and lowers its moved Item to a factual mapping", () => {
  const baseComponent = {
    module: { name: "@example/base-picture", version: "1" },
    name: "base-picture",
  } as const;
  const baseSource = {
    id: "base-source",
    outputs: { picture: {
      kind: "constant" as const,
      type: pictureType,
      spatialDomain: { id: "base-space", region: { x: 0, y: 0, width: 100, height: 100 } },
    } },
  };
  const baseFacet = createNlePackageFacet({ components: [{
    component: baseComponent,
    resolve: () => ({
      source: baseSource,
      pictureOutput: "picture",
      html: {
        source: baseSource.id,
        output: "picture",
        implementation: { kind: "program" as const, program: pictureFilterOperator(
          IDENTITY_PICTURE_FILTER,
        ).program },
      },
    }),
  }] });
  const host = createNleLoweringHostFromFacets([...pictureFilterHypitPackage.facets, baseFacet]);
  const empty = createNleProject({
    id: "animated-filter",
    name: "Animated filter",
    frameRate: { numerator: 30, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "black" },
  });
  const project = applyNleTransaction(empty, { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "Picture", kind: "picture", locked: false, muted: false, items: [{
      id: "clip",
      kind: "component",
      startFrame: 0,
      durationFrames: 60,
      localStartFrame: 0,
      enabled: true,
      component: baseComponent,
      parameters: {},
      picture: {
        layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" },
        effects: [{
          id: "animated",
          effect: pictureFilterNleSymbol,
          parameters: canonicalize(animatedParameters),
        }],
      },
    }] },
  }] });

  const reopened = parseNleProject(serializeNleProject(project));
  assert.deepEqual(reopened, project);
  const authoringHost = createNleAuthoringHostFromFacets(pictureFilterHypitPackage.facets);
  assert.deepEqual(authoringHost.inspectEffectParameters(reopened, "clip", "animated"),
    canonicalize(animatedParameters));
  const insertedState = { ...IDENTITY_PICTURE_FILTER, opacity: 0.75, grayscale: 1 };
  const editTransaction = authoringHost.planEffectParameterEdit(reopened, "clip", "animated", {
    kind: "set-frame-state",
    atFrame: 15,
    state: insertedState,
  });
  let editSession = createNleEditSession(reopened);
  editSession = commitNleEdit(editSession, { label: "Set filter frame", transaction: editTransaction });
  const editedItem = findNleItem(editSession.current, "clip").item;
  if (editedItem.kind !== "component") throw new Error("Edited filter Item changed kind.");
  const editedParameters = editedItem.picture?.effects[0]?.parameters as unknown;
  const editedControl = pictureFilterControlFromNleParameters(editedParameters as typeof animatedParameters, {
    itemId: editedItem.id,
    durationFrames: editedItem.durationFrames,
    frameRate: editSession.current.frameRate,
  });
  assert.deepEqual(evaluatePictureFilterControl(editedControl, at(1, 2)), insertedState);
  editSession = undoNleEdit(editSession);
  assert.deepEqual(editSession.current, { ...reopened, revision: 3 });

  const initial = lowerNleProjectToAudiovisual(reopened, host);
  const initialNode = initial.program.picture?.nodes["clip:effect:animated"];
  assert.equal(initialNode?.kind, "apply");
  if (initialNode?.kind !== "apply") throw new Error("Animated Effect did not lower to apply.");
  const initialMapping = initialNode.controlMappings.filter;
  if (initialMapping === undefined) throw new Error("Animated Effect did not lower to a factual Mapping.");
  assert.deepEqual(resolveTemporalControlPosition(
    initialNode.operator.temporalControls.filter!,
    initialMapping,
    initial.program.domain,
    at(1, 2),
  ), at(1, 2));

  const moved = applyNleTransaction(reopened, { revision: 1, commands: [{
    kind: "item.move", ids: ["clip"], deltaFrames: 30,
  }] });
  const movedProgram = lowerNleProjectToAudiovisual(moved, host).program;
  const movedNode = movedProgram.picture?.nodes["clip:effect:animated"];
  if (movedNode?.kind !== "apply") throw new Error("Moved animated Effect did not lower to apply.");
  const movedMapping = movedNode.controlMappings.filter;
  if (movedMapping === undefined) throw new Error("Moved Effect did not lower to a factual Mapping.");
  assert.deepEqual(resolveTemporalControlPosition(
    movedNode.operator.temporalControls.filter!,
    movedMapping,
    movedProgram.domain,
    at(3, 2),
  ), at(1, 2));
});
