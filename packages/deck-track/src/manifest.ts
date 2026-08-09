import {
  compositionDependency,
  compositionTypes,
  visualTextDocumentSchema,
  visualTextFlowSchema,
  visualTextPaintSchema,
  visualTextTypographySchema,
} from "@narratage/composition";
import { mediaDependency } from "@narratage/media";
import {
  mediaFramePresentationSchema,
  mediaLayerSetSchema,
  mediaLifecycleMotionSchema,
  mediaTrackDependency,
  mediaTrackTypes,
} from "@narratage/media-track";
import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import { spatialDependency, spatialFrameSchema, spatialTypes } from "@narratage/spatial";
import { temporalDependency } from "@narratage/temporal";

import { depthStackImplementationDigests, depthStackValidatorDigests } from "./program.js";

export const depthStackModuleRef = { name: "@narratage/deck-track", version: "1" } as const;
export const depthStackTypes = {
  header: { module: depthStackModuleRef, name: "DepthStackHeader" },
  spec: { module: depthStackModuleRef, name: "DepthStackSpec" },
  cardSpec: { module: depthStackModuleRef, name: "DepthStackCardSpec" },
  cardLabel: { module: depthStackModuleRef, name: "DepthStackCardLabel" },
  cardSet: { module: depthStackModuleRef, name: "DepthStackCardSet" },
  program: { module: depthStackModuleRef, name: "DepthStackProgram" },
} satisfies Record<string, TypeRef>;
export const depthStackProducers = {
  createCards: { module: depthStackModuleRef, name: "create-depth-stack-card-set" },
  appendMomentCard: { module: depthStackModuleRef, name: "append-depth-stack-moment-card" },
  finalizeProgramEnd: { module: depthStackModuleRef, name: "finalize-depth-stack-at-program-end" },
  finalizeUntilMoment: { module: depthStackModuleRef, name: "finalize-depth-stack-until-moment" },
  finalizeUntilSelectionStart: { module: depthStackModuleRef, name: "finalize-depth-stack-until-selection-start" },
  finalizeUntilSelectionEnd: { module: depthStackModuleRef, name: "finalize-depth-stack-until-selection-end" },
  render: { module: depthStackModuleRef, name: "render-depth-stack" },
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
  contract: { schema: { kind: "literal", value: "svml.depth-stack-spec@1" } },
  visibility: { schema: object({ previous: { schema: unsignedInteger }, next: { schema: unsignedInteger }, wrap: { schema: { kind: "boolean" } } }) },
  poses: { schema: object({ current: { schema: pose }, previous: { schema: poseStep }, next: { schema: poseStep } }) },
  reflow: { schema: object({ durationFrames: { schema: unsignedInteger }, easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]) } }) },
  presentation: { schema: mediaFramePresentationSchema }, motion: { schema: mediaLifecycleMotionSchema }, stackingOrder: { schema: integer },
});
export const depthStackCardSpecSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.depth-stack-card-spec@1" } }, id: { schema: string }, playback: { schema: playback },
});
export const depthStackCardLabelSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ contract: { schema: { kind: "literal", value: "svml.depth-stack-card-label@1" } }, kind: { schema: { kind: "literal", value: "none" } } }),
  object({
    contract: { schema: { kind: "literal", value: "svml.depth-stack-card-label@1" } }, kind: { schema: { kind: "literal", value: "text" } },
    document: { schema: visualTextDocumentSchema }, typography: { schema: visualTextTypographySchema },
    paints: { schema: { kind: "array", items: visualTextPaintSchema } }, flow: { schema: visualTextFlowSchema },
  }),
] };
const frameSpan = object({ startFrame: { schema: unsignedInteger }, endFrameExclusive: { schema: positiveInteger } });
const card = object({
  id: { schema: string }, activationFrame: { schema: unsignedInteger }, material: { schema: mediaLayerSetSchema },
  label: { schema: depthStackCardLabelSchema }, playback: { schema: playback },
});
export const depthStackHeaderSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.depth-stack-header@1" } }, id: { schema: string },
});
export const depthStackCardSetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.depth-stack-card-set@1" } }, cards: { schema: { kind: "array", items: card } },
});
export const depthStackProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.depth-stack-program@1" } }, id: { schema: string }, span: { schema: frameSpan },
  terminalFrame: { schema: positiveInteger }, frame: { schema: spatialFrameSchema }, spec: { schema: depthStackSpecSchema },
  cards: { schema: { kind: "array", minItems: 1, items: card } },
});

export const depthStackSurfaceImplementationDigests = {
  label: digestOf("@narratage/deck-track/label-surface@1"),
  track: digestOf("@narratage/deck-track/depth-stack-surface@1"),
} as const;
const registered = (locator: string, digest: ReturnType<typeof digestOf>) => ({ kind: "registered" as const, locator, digest });
const validator = (locator: string, digest: ReturnType<typeof digestOf>) => ({ abi: "svml.type-validator@1" as const, implementation: registered(locator, digest) });
const finalizeInputs = [
  { name: "set", type: depthStackTypes.cardSet }, { name: "header", type: depthStackTypes.header },
  { name: "frame", type: spatialTypes.frame }, { name: "spec", type: depthStackTypes.spec },
  { name: "space", type: programSpaceTypes.programSpace },
] as const;

export const depthStackManifest: ModuleManifest = {
  format: "svml.module@1", name: depthStackModuleRef.name, version: depthStackModuleRef.version,
  dependencies: [narrativeDependency, semanticMapDependency, programSpaceDependency, spatialDependency, temporalDependency, mediaDependency, mediaTrackDependency, compositionDependency],
  types: [
    { name: depthStackTypes.header.name, schema: depthStackHeaderSchema },
    { name: depthStackTypes.spec.name, schema: depthStackSpecSchema },
    { name: depthStackTypes.cardSpec.name, schema: depthStackCardSpecSchema },
    { name: depthStackTypes.cardLabel.name, schema: depthStackCardLabelSchema },
    { name: depthStackTypes.cardSet.name, schema: depthStackCardSetSchema },
    { name: depthStackTypes.program.name, schema: depthStackProgramSchema, validator: validator("@narratage/deck-track/validate-program", depthStackValidatorDigests.program) },
  ], capabilities: [],
  surfaces: [
    { name: "label", tag: "Label", mode: "structured", outputs: [depthStackTypes.cardLabel], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/deck-track/label-surface", digest: depthStackSurfaceImplementationDigests.label } },
    { name: "track", tag: "DepthStack", mode: "structured", outputs: [depthStackTypes.header, depthStackTypes.spec, depthStackTypes.cardSpec, depthStackTypes.program, compositionTypes.visualTrack], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/deck-track/depth-stack-surface", digest: depthStackSurfaceImplementationDigests.track } },
  ],
  producers: [
    { name: depthStackProducers.createCards.name, inputs: [], outputs: [{ name: "set", type: depthStackTypes.cardSet }], needs: [], implementation: registered("@narratage/deck-track/create-cards", depthStackImplementationDigests.createCards) },
    { name: depthStackProducers.appendMomentCard.name, inputs: [
      { name: "set", type: depthStackTypes.cardSet }, { name: "material", type: mediaTrackTypes.layerSet },
      { name: "label", type: depthStackTypes.cardLabel }, { name: "spec", type: depthStackTypes.cardSpec },
      { name: "map", type: semanticMapTypes.complete }, { name: "moment", type: narrativeTypes.moment },
      { name: "space", type: programSpaceTypes.programSpace },
    ], outputs: [{ name: "set", type: depthStackTypes.cardSet }], needs: [], implementation: registered("@narratage/deck-track/append-moment-card", depthStackImplementationDigests.appendMomentCard) },
    { name: depthStackProducers.finalizeProgramEnd.name, inputs: finalizeInputs, outputs: [{ name: "program", type: depthStackTypes.program }], needs: [], implementation: registered("@narratage/deck-track/finalize-program-end", depthStackImplementationDigests.finalizeProgramEnd) },
    ...([
      [depthStackProducers.finalizeUntilMoment, narrativeTypes.moment, depthStackImplementationDigests.finalizeUntilMoment, "@narratage/deck-track/finalize-until-moment"],
      [depthStackProducers.finalizeUntilSelectionStart, narrativeTypes.selection, depthStackImplementationDigests.finalizeUntilSelectionStart, "@narratage/deck-track/finalize-until-selection-start"],
      [depthStackProducers.finalizeUntilSelectionEnd, narrativeTypes.selection, depthStackImplementationDigests.finalizeUntilSelectionEnd, "@narratage/deck-track/finalize-until-selection-end"],
    ] as const).map(([producer, terminalType, implementationDigest, locator]) => ({
      name: producer.name, inputs: [...finalizeInputs, { name: "map", type: semanticMapTypes.complete }, { name: "terminal", type: terminalType }],
      outputs: [{ name: "program", type: depthStackTypes.program }], needs: [], implementation: registered(locator, implementationDigest),
    })),
    { name: depthStackProducers.render.name, inputs: [
      { name: "canvas", type: spatialTypes.canvas }, { name: "space", type: programSpaceTypes.programSpace },
      { name: "program", type: depthStackTypes.program },
    ], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [], implementation: registered("@narratage/deck-track/render", depthStackImplementationDigests.render) },
  ],
};
export const depthStackManifestDigest = digestOf(depthStackManifest);
export const depthStackDependency = { module: depthStackModuleRef, digest: depthStackManifestDigest } as const;
