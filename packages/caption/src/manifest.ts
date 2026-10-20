import { temporalDependency, temporalTypes, temporalWindowSchema } from "@hypit/temporal";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const captionModuleRef = { name: "@hypit/caption", version: "1" } as const;
export const captionProducers = {
  create: { module: captionModuleRef, name: "create-caption-uses" },
  append: { module: captionModuleRef, name: "append-caption-use" },
  appendUnbounded: { module: captionModuleRef, name: "append-unbounded-caption-use" },
} satisfies Record<string, ProducerRef>;
export const captionTypes = {
  document: { module: captionModuleRef, name: "CaptionDocument" },
  header: { module: captionModuleRef, name: "CaptionTrackSpec" },
  filter: { module: captionModuleRef, name: "CaptionContentFilter" },
  style: { module: captionModuleRef, name: "CaptionStyle" },
  program: { module: captionModuleRef, name: "CaptionProgram" },
  timing: { module: captionModuleRef, name: "CaptionTiming" },
} satisfies Record<string, TypeRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const captionDisplayWord = object({
  separatorBefore: { schema: { kind: "string", enum: ["", " "] } },
  id: { schema: string }, unitId: { schema: string }, text: { schema: string },
  attributes: { schema: { kind: "array", items: object({
    name: { schema: string },
    value: { schema: { kind: "oneOf", variants: [string, { kind: "number" }, { kind: "boolean" }] } },
  }) } },
});
const captionUnit = object({
  id: { schema: string },
  wordIds: { schema: { kind: "array", minItems: 1, items: string } },
});
const captionCue = object({
  id: { schema: string }, unitIds: { schema: { kind: "array", minItems: 1, items: string } },
  role: { schema: string, optional: true },
});
export const captionDocumentSchema: ValueSchema = object({
  id: { schema: string },
  units: { schema: { kind: "array", items: captionUnit } },
  words: { schema: { kind: "array", items: captionDisplayWord } },
  cues: { schema: { kind: "array", items: captionCue } },
});
export const captionStyleSchema: ValueSchema = object({
  id: { schema: string },
  rendering: { schema: { kind: "oneOf", variants: [{ kind: "null" }, object({
    family: { schema: string },
    parameters: { schema: { kind: "object", fields: {}, allowUnknown: true } },
  })] } },
});
export const captionProgramSchema: ValueSchema = object({
  id: { schema: string }, documentId: { schema: string },
  styles: { schema: { kind: "array", items: captionStyleSchema } },
  uses: { schema: { kind: "array", items: object({
    id: { schema: string }, window: { schema: temporalWindowSchema, optional: true },
    styleId: { schema: string }, role: { schema: string, optional: true },
  }) } },
});
const timedUnit = object({ unitId: { schema: string }, startFrame: { schema: integer }, endFrameExclusive: { schema: integer } });
export const captionTimingSchema: ValueSchema = object({
  timelineId: { schema: string },
  documentId: { schema: string },
  units: { schema: { kind: "array", items: timedUnit } },
});

export const captionMarkupSurfaces = [{
  name: "hidden", tag: "Hidden", mode: "structured", outputs: [captionTypes.style],
  vocabulary: {
    summary: "Declares a Caption Style that contributes no rendering when selected by Use.",
    attributes: [{ name: "id", kind: "identifier", required: true, summary: "Names the hidden Style." }],
    example: '<caption:Hidden id="hidden"/>',
    notes: ["Hidden is a complete Style choice; it uses ordinary Use precedence and changes no speech or semantic anchors."],
  },
}] as const;

export const captionManifest: ModuleManifest = {
  format: "hypit.module@1", name: captionModuleRef.name, version: captionModuleRef.version,
  dependencies: [temporalDependency], types: [
    { name: captionTypes.document.name }, { name: captionTypes.header.name }, { name: captionTypes.filter.name },
    { name: captionTypes.style.name }, { name: captionTypes.program.name }, { name: captionTypes.timing.name },
  ], capabilities: [], producers: [{
    name: captionProducers.create.name,
    inputs: [{ name: "document", type: captionTypes.document }, { name: "header", type: captionTypes.header }],
    result: { kind: "output" as const, name: "program", type: captionTypes.program },
  }, {
    name: captionProducers.append.name,
    inputs: [{ name: "program", type: captionTypes.program }, { name: "window", type: temporalTypes.window },
      { name: "style", type: captionTypes.style }, { name: "filter", type: captionTypes.filter }],
    result: { kind: "output" as const, name: "program", type: captionTypes.program },
  }, {
    name: captionProducers.appendUnbounded.name,
    inputs: [{ name: "program", type: captionTypes.program },
      { name: "style", type: captionTypes.style }, { name: "filter", type: captionTypes.filter }],
    result: { kind: "output" as const, name: "program", type: captionTypes.program },
  }],
};
export const captionDependency = { module: captionModuleRef } as const;
