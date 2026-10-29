import { compositionDependency, compositionTypes, audioReconstructionProgramSchema } from "@hypit/composition";
import { mediaDependency, mediaTypes, workingPictureSpecSchema } from "@hypit/media";
import { contentFitSchema, spatialDependency, spatialFrameSchema, spatialTypes } from "@hypit/spatial";
import { temporalDependency, temporalDurationSchema, temporalMapSchema, temporalRelationSpecSchema, temporalTypes, temporalWindowSchema } from "@hypit/temporal";
import { timelineDependency, timelineTypes } from "@hypit/timeline";
import {
  mediaSampleAppearanceSchema,
  visualClipSpecSchema,
  visualTrackDependency,
  visualTrackHeaderSchema,
} from "@hypit/visual-track";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const compositionClipModuleRef = { name: "@hypit/composition-clip", version: "1" } as const;
export const compositionClipTypes = {
  occurrenceSpec: { module: compositionClipModuleRef, name: "CompositionOccurrenceSpec" },
  occurrence: { module: compositionClipModuleRef, name: "CompositionOccurrence" },
  visualUseSpec: { module: compositionClipModuleRef, name: "CompositionVisualUseSpec" },
  visualUse: { module: compositionClipModuleRef, name: "CompositionVisualUse" },
  audioUse: { module: compositionClipModuleRef, name: "CompositionAudioUse" },
} satisfies Record<string, TypeRef>;
export const compositionClipProducers = {
  createOccurrence: { module: compositionClipModuleRef, name: "create-occurrence" },
  bindVisualUse: { module: compositionClipModuleRef, name: "bind-visual-use" },
  renderVisual: { module: compositionClipModuleRef, name: "render-visual" },
  renderAudio: { module: compositionClipModuleRef, name: "render-audio" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
export const compositionOccurrenceSpecSchema = object({
  id: { schema: string }, sampling: { schema: temporalRelationSpecSchema, optional: true },
});
export const compositionOccurrenceSchema = object({
  id: { schema: string }, source: { schema: { kind: "object", fields: {}, allowUnknown: true } },
  window: { schema: temporalWindowSchema }, sampling: { schema: temporalMapSchema },
});
export const compositionVisualUseSchema = object({
  header: { schema: visualTrackHeaderSchema }, frame: { schema: spatialFrameSchema },
  fit: { schema: contentFitSchema }, clip: { schema: visualClipSpecSchema },
  appearance: { schema: mediaSampleAppearanceSchema },
});
export const compositionVisualUseSpecSchema = object({
  header: { schema: visualTrackHeaderSchema }, fit: { schema: contentFitSchema },
  clip: { schema: visualClipSpecSchema }, appearance: { schema: mediaSampleAppearanceSchema },
});
export const compositionAudioUseSchema = object({
  id: { schema: string }, gain: { schema: { kind: "number", minimum: 0 } },
  fadeIn: { schema: temporalDurationSchema }, fadeOut: { schema: temporalDurationSchema },
  reconstruction: { schema: audioReconstructionProgramSchema, optional: true },
});

export const compositionClipManifest: ModuleManifest = {
  format: "hypit.module@1", ...compositionClipModuleRef,
  dependencies: [compositionDependency, mediaDependency, spatialDependency, temporalDependency, timelineDependency, visualTrackDependency],
  types: Object.values(compositionClipTypes).map((type) => type.name), capabilities: [],
  producers: [
    { name: compositionClipProducers.createOccurrence.name, inputs: [
      { name: "timeline", type: timelineTypes.timeline }, { name: "source", type: compositionTypes.composition },
      { name: "window", type: temporalTypes.window }, { name: "spec", type: compositionClipTypes.occurrenceSpec },
    ], result: { kind: "output", name: "occurrence", type: compositionClipTypes.occurrence } },
    { name: compositionClipProducers.bindVisualUse.name, inputs: [
      { name: "spec", type: compositionClipTypes.visualUseSpec }, { name: "frame", type: spatialTypes.frame },
    ], result: { kind: "output", name: "use", type: compositionClipTypes.visualUse } },
    { name: compositionClipProducers.renderVisual.name, inputs: [
      { name: "timeline", type: timelineTypes.timeline }, { name: "picture", type: mediaTypes.workingPicture },
      { name: "occurrence", type: compositionClipTypes.occurrence }, { name: "use", type: compositionClipTypes.visualUse },
    ], result: { kind: "output", name: "track", type: compositionTypes.visualTrack } },
    { name: compositionClipProducers.renderAudio.name, inputs: [
      { name: "timeline", type: timelineTypes.timeline }, { name: "occurrence", type: compositionClipTypes.occurrence },
      { name: "use", type: compositionClipTypes.audioUse },
    ], result: { kind: "output", name: "track", type: compositionTypes.audioTrack } },
  ],
};
