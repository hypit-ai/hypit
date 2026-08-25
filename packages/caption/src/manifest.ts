import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { semanticTrackDependency, semanticTrackTypes } from "@hypit/semantic-track";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";

export const captionModuleRef = { name: "@hypit/caption", version: "1" } as const;
export const captionProducers = {
  temporalizeDocument: { module: captionModuleRef, name: "temporalize-caption-document" },
} satisfies Record<string, ProducerRef>;
export const captionTypes = {
  style: { module: captionModuleRef, name: "CaptionStyle" },
  program: { module: captionModuleRef, name: "CaptionProgram" },
  timedProjection: { module: captionModuleRef, name: "TimedCaptionProjection" },
} satisfies Record<string, TypeRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
export const captionStyleSchema: ValueSchema = object({
  id: { schema: string },
  rendering: { schema: object({
    family: { schema: string },
    parameters: { schema: { kind: "object", fields: {}, allowUnknown: true } },
  }) },
});
export const captionProgramSchema: ValueSchema = object({
  id: { schema: string }, documentId: { schema: string },
  styles: { schema: { kind: "array", minItems: 1, items: captionStyleSchema } },
  runs: { schema: { kind: "array", minItems: 1, items: object({
    id: { schema: string }, styleId: { schema: string }, unitIds: { schema: { kind: "array", minItems: 1, items: string } },
  }) } },
  wordRuns: { schema: { kind: "array", items: object({
    id: { schema: string }, styleId: { schema: string }, wordIds: { schema: { kind: "array", minItems: 1, items: string } },
  }) } },
  mutedUnitIds: { schema: { kind: "array", items: string } },
});
const timedUnit = object({ unitId: { schema: string }, startFrame: { schema: integer }, endFrameExclusive: { schema: integer } });
export const timedCaptionProjectionSchema: ValueSchema = object({
  spaceId: { schema: string },
  narrativeId: { schema: string },
  documentId: { schema: string },
  cues: { schema: { kind: "array", items: object({
    id: { schema: string }, styleId: { schema: string }, startFrame: { schema: integer }, endFrameExclusive: { schema: integer },
    units: { schema: { kind: "array", minItems: 1, items: timedUnit } },
  }) } },
});

export const captionMarkupSurfaces = [{
  name: "program", tag: "Program", mode: "structured", outputs: [captionTypes.program],
  vocabulary: {
    summary: "Assigns rendering Styles to the Script-owned CaptionDocument using authored semantic selections.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the CaptionProgram." },
      { name: "document", kind: "reference", required: true, accepts: [narrativeTypes.captionDocument], summary: "The complete Script-owned CaptionDocument." },
      { name: "narrative", kind: "reference", required: true, accepts: [narrativeTypes.narrative], summary: "The semantic anchor universe used to project selections." },
      { name: "default", kind: "reference", required: true, accepts: [captionTypes.style], summary: "The default Style." },
    ],
    children: [
      { tag: "Use", cardinality: "many", summary: "Applies a Style to one Role or one complete semantic Selection.", attributes: [
        { name: "style", kind: "reference", required: true, accepts: [captionTypes.style], summary: "The Style to apply." },
        { name: "role", kind: "literal", required: false, summary: "Selects all Caption units authored for this Role." },
        { name: "selection", kind: "reference", required: false, accepts: [narrativeTypes.selection], summary: "Selects complete Caption units contained by a semantic Selection." },
        { name: "attribute", kind: "literal", required: false, summary: "Selects display words carrying this Script-native attribute." },
      ] },
      { tag: "Mute", cardinality: "many", summary: "Hides selected complete Caption units.", attributes: [
        { name: "role", kind: "literal", required: false, summary: "Selects all Caption units authored for this Role." },
        { name: "selection", kind: "reference", required: false, accepts: [narrativeTypes.selection], summary: "Selects complete Caption units contained by a semantic Selection." },
      ] },
    ],
    example: '<caption:Program id="captions" document={story.caption} narrative={story} default={plain}/> ',
  },
}] as const;

export const captionManifest: ModuleManifest = {
  format: "hypit.module@1", name: captionModuleRef.name, version: captionModuleRef.version,
  dependencies: [narrativeDependency, semanticTrackDependency], types: [
    { name: captionTypes.style.name }, { name: captionTypes.program.name }, { name: captionTypes.timedProjection.name },
  ], capabilities: [], producers: [{
    name: captionProducers.temporalizeDocument.name,
    inputs: [
      { name: "document", type: narrativeTypes.captionDocument },
      { name: "semantic", type: semanticTrackTypes.track },
      { name: "program", type: captionTypes.program },
    ],
    outputs: [{ name: "caption", type: captionTypes.timedProjection }], needs: [],
  }],
};
