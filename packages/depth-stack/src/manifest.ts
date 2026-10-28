import { frameSpanSchema, timelineTypes, timelineDependency } from "@hypit/timeline";
import {
  compositionDependency,
  compositionTypes,
  visualTextDocumentSchema,
  visualTextFlowSchema,
  visualTextPaintSchema,
  visualTextTypographySchema,
} from "@hypit/composition";
import { mediaDependency } from "@hypit/media";
import { mediaOperationsModuleRef } from "@hypit/media-operations";
import {
  visualFrameTreatmentSchema,
  mediaLayerSetSchema,
  visualTrackDependency,
  visualTrackTypes,
} from "@hypit/visual-track";

import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { spatialDependency, spatialFrameSchema, spatialTypes } from "@hypit/spatial";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { textDependency, textTypes } from "@hypit/hypit/text";

export const depthStackModuleRef = { name: "@hypit/depth-stack", version: "1" } as const;
export const depthStackTypes = {
  header: { module: depthStackModuleRef, name: "DepthStackHeader" },
  spec: { module: depthStackModuleRef, name: "DepthStackSpec" },
  cardSpec: { module: depthStackModuleRef, name: "DepthStackCardSpec" },
  cardLabel: { module: depthStackModuleRef, name: "DepthStackCardLabel" },
  cardLabelStyle: { module: depthStackModuleRef, name: "DepthStackCardLabelStyle" },
  cardSet: { module: depthStackModuleRef, name: "DepthStackCardSet" },
  program: { module: depthStackModuleRef, name: "DepthStackProgram" },
} satisfies Record<string, TypeRef>;
export const depthStackProducers = {
  createCards: { module: depthStackModuleRef, name: "create-depth-stack-card-set" },
  appendCard: { module: depthStackModuleRef, name: "append-depth-stack-card" },
  finalize: { module: depthStackModuleRef, name: "finalize-depth-stack" },
  render: { module: depthStackModuleRef, name: "render-depth-stack" },
  bindLabelText: { module: depthStackModuleRef, name: "bind-depth-stack-label-text" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const positive = { kind: "number", minimum: 0.000001 } as const;
const integer = { kind: "number", integer: true } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const enumString = (values: readonly string[]): ValueSchema => ({ kind: "string", enum: values });
const tone = object({ brightness: { schema: positive }, contrast: { schema: positive }, saturation: { schema: positive } });
const pose = object({
  xPx: { schema: number }, yPx: { schema: number }, scale: { schema: positive }, rotationDeg: { schema: number },
  opacity: { schema: { kind: "number", minimum: 0, maximum: 1 } }, stacking: { schema: integer }, tone: { schema: tone },
});
const poseStep = object({
  xPerDepthPx: { schema: number }, yPerDepthPx: { schema: number }, scalePerDepth: { schema: positive },
  rotationPerDepthDeg: { schema: number }, rotationMode: { schema: enumString(["linear", "alternate"]) },
  opacityPerDepth: { schema: { kind: "number", minimum: 0, maximum: 1 } }, stackingPerDepth: { schema: integer },
  tonePerDepth: { schema: tone },
});
const playback = object({
  future: { schema: enumString(["hold-head", "continue"]) },
  past: { schema: enumString(["hold-tail", "continue", "hide"]) },
});

export const depthStackSpecSchema: ValueSchema = object({

  visibility: { schema: object({ previous: { schema: unsignedInteger }, next: { schema: unsignedInteger }, wrap: { schema: { kind: "boolean" } } }) },
  poses: { schema: object({ current: { schema: pose }, previous: { schema: poseStep }, next: { schema: poseStep } }) },
  reflow: { schema: object({ durationFrames: { schema: unsignedInteger }, easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]) } }) },
  treatment: { schema: visualFrameTreatmentSchema },
});
export const depthStackCardSpecSchema: ValueSchema = object({
  id: { schema: string }, playback: { schema: playback },
});
export const depthStackCardLabelSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "none" } } }),
  object({
    kind: { schema: { kind: "literal", value: "text" } },
    document: { schema: visualTextDocumentSchema }, typography: { schema: visualTextTypographySchema },
    paints: { schema: { kind: "array", items: visualTextPaintSchema } }, flow: { schema: visualTextFlowSchema },
  }),
] };
export const depthStackCardLabelStyleSchema: ValueSchema = object({

  typography: { schema: visualTextTypographySchema }, paints: { schema: { kind: "array", items: visualTextPaintSchema } },
  flow: { schema: visualTextFlowSchema },
});
const card = object({
  id: { schema: string }, activationFrame: { schema: unsignedInteger }, material: { schema: mediaLayerSetSchema },
  label: { schema: depthStackCardLabelSchema }, playback: { schema: playback },
});
export const depthStackHeaderSchema: ValueSchema = object({
  id: { schema: string },
});
export const depthStackCardSetSchema: ValueSchema = object({
  cards: { schema: { kind: "array", items: card } },
});
export const depthStackProgramSchema: ValueSchema = object({
  id: { schema: string }, span: { schema: frameSpanSchema },
  terminalFrame: { schema: positiveInteger }, frame: { schema: spatialFrameSchema }, spec: { schema: depthStackSpecSchema },
  cards: { schema: { kind: "array", minItems: 1, items: card } },
});
const finalizeInputs = [
  { name: "set", type: depthStackTypes.cardSet }, { name: "header", type: depthStackTypes.header },
  { name: "frame", type: spatialTypes.frame }, { name: "spec", type: depthStackTypes.spec },
  { name: "timeline", type: timelineTypes.timeline },
] as const;


export const depthStackManifest: ModuleManifest = {
  format: "hypit.module@1", name: depthStackModuleRef.name, version: depthStackModuleRef.version,
  dependencies: [timelineDependency, spatialDependency, temporalDependency, mediaDependency, mediaOperationsModuleRef, visualTrackDependency, compositionDependency, textDependency],
  types: [
    depthStackTypes.header.name,
    depthStackTypes.spec.name,
    depthStackTypes.cardSpec.name,
    depthStackTypes.cardLabel.name,
    depthStackTypes.cardLabelStyle.name,
    depthStackTypes.cardSet.name,
    depthStackTypes.program.name,
  ], capabilities: [],
  producers: [
    { name: depthStackProducers.bindLabelText.name, inputs: [{ name: "style", type: depthStackTypes.cardLabelStyle }, { name: "content", type: textTypes.text }], result: { kind: "output" as const, name: "label", type: depthStackTypes.cardLabel } },
    { name: depthStackProducers.createCards.name, inputs: [], result: { kind: "output" as const, name: "set", type: depthStackTypes.cardSet } },
    { name: depthStackProducers.appendCard.name, inputs: [
      { name: "set", type: depthStackTypes.cardSet }, { name: "timeline", type: timelineTypes.timeline }, { name: "material", type: visualTrackTypes.layerSet },
      { name: "label", type: depthStackTypes.cardLabel }, { name: "spec", type: depthStackTypes.cardSpec },
      { name: "activation", type: temporalTypes.instant },
    ], result: { kind: "output" as const, name: "set", type: depthStackTypes.cardSet } },
    { name: depthStackProducers.finalize.name,
      inputs: [...finalizeInputs, { name: "terminal", type: temporalTypes.instant }],
      result: { kind: "output" as const, name: "program", type: depthStackTypes.program } },
    { name: depthStackProducers.render.name, inputs: [
      { name: "timeline", type: timelineTypes.timeline },
      { name: "program", type: depthStackTypes.program },
    ], result: { kind: "output" as const, name: "track", type: compositionTypes.visualTrack } },
  ],
};
export const depthStackDependency = depthStackModuleRef;
