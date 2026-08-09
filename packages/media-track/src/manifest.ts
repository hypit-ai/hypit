import { artifactDependency, artifactTypes } from "@narratage/artifact";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import { mediaArtifactSchema, mediaDependency } from "@narratage/media";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import {
  contentFitSchema,
  intrinsicExtentSchema,
  spatialDependency,
  spatialFrameSchema,
  spatialTypes,
} from "@narratage/spatial";

import { mediaTrackImplementationDigests, mediaTrackValidatorDigests } from "./program.js";

export const mediaTrackModuleRef = { name: "@narratage/media-track", version: "0.0.0-dev" } as const;
export const mediaTrackTypes = {
  program: { module: mediaTrackModuleRef, name: "MediaTrackProgram" },
  header: { module: mediaTrackModuleRef, name: "MediaTrackHeader" },
  stillItemSpec: { module: mediaTrackModuleRef, name: "MediaStillItemSpec" },
  set: { module: mediaTrackModuleRef, name: "MediaTrackSet" },
} satisfies Record<string, TypeRef>;
export const mediaTrackProducers = {
  createSet: { module: mediaTrackModuleRef, name: "create-media-track-set" },
  appendFullStill: { module: mediaTrackModuleRef, name: "append-full-still-media-item" },
  finalize: { module: mediaTrackModuleRef, name: "finalize-media-track" },
  render: { module: mediaTrackModuleRef, name: "render-media-track" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const frameSpan = object({ startFrame: { schema: unsignedInteger }, endFrameExclusive: { schema: unsignedInteger } });
const presentation = object({
  clip: { schema: { kind: "literal", value: "frame" } },
  fill: { schema: object({ kind: { schema: { kind: "literal", value: "transparent" } } }) },
});
const stillLayer = object({
  id: { schema: string },
  kind: { schema: { kind: "literal", value: "still" } },
  artifact: { schema: mediaArtifactSchema },
  extent: { schema: intrinsicExtentSchema },
  fit: { schema: contentFitSchema },
});
const item = object({
  id: { schema: string }, span: { schema: frameSpan }, frame: { schema: spatialFrameSchema },
  presentation: { schema: presentation },
  layers: { schema: { kind: "array", minItems: 1, items: stillLayer } },
  stacking: { schema: object({ order: { schema: integer }, tieBreak: { schema: string } }) },
});
export const mediaTrackProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.media-track-program@1" } },
  id: { schema: string }, items: { schema: { kind: "array", minItems: 1, items: item } },
});
export const mediaTrackHeaderSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.media-track-header@1" } }, id: { schema: string },
});
export const mediaStillItemSpecSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.media-still-item-spec@1" } },
  id: { schema: string }, stackingOrder: { schema: integer }, presentation: { schema: presentation },
});
export const mediaTrackSetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.media-track-set@1" } },
  items: { schema: { kind: "array", items: item } },
});

const validator = (locator: string, digest: ReturnType<typeof digestOf>) => ({
  abi: "svml.type-validator@1" as const,
  implementation: { kind: "registered" as const, locator, digest },
});

export const mediaTrackManifest: ModuleManifest = {
  format: "svml.module@1",
  name: mediaTrackModuleRef.name,
  version: mediaTrackModuleRef.version,
  dependencies: [artifactDependency, mediaDependency, programSpaceDependency, spatialDependency, compositionDependency],
  types: [
    { name: mediaTrackTypes.program.name, schema: mediaTrackProgramSchema, validator: validator("@narratage/media-track/validate-program", mediaTrackValidatorDigests.program) },
    { name: mediaTrackTypes.header.name, schema: mediaTrackHeaderSchema },
    { name: mediaTrackTypes.stillItemSpec.name, schema: mediaStillItemSpecSchema },
    { name: mediaTrackTypes.set.name, schema: mediaTrackSetSchema },
  ],
  capabilities: [],
  surfaces: [],
  producers: [
    { name: mediaTrackProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [], implementation: { kind: "registered", locator: "@narratage/media-track/create-set", digest: mediaTrackImplementationDigests.createSet } },
    { name: mediaTrackProducers.appendFullStill.name, inputs: [
      { name: "set", type: mediaTrackTypes.set }, { name: "header", type: mediaTrackTypes.header },
      { name: "space", type: programSpaceTypes.programSpace }, { name: "source", type: artifactTypes.blob },
      { name: "extent", type: spatialTypes.extent }, { name: "frame", type: spatialTypes.frame },
      { name: "fit", type: spatialTypes.fit }, { name: "spec", type: mediaTrackTypes.stillItemSpec },
    ], outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [], implementation: { kind: "registered", locator: "@narratage/media-track/append-full-still", digest: mediaTrackImplementationDigests.appendFullStill } },
    { name: mediaTrackProducers.finalize.name, inputs: [{ name: "set", type: mediaTrackTypes.set }, { name: "header", type: mediaTrackTypes.header }], outputs: [{ name: "program", type: mediaTrackTypes.program }], needs: [], implementation: { kind: "registered", locator: "@narratage/media-track/finalize", digest: mediaTrackImplementationDigests.finalize } },
    { name: mediaTrackProducers.render.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: mediaTrackTypes.program }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [], implementation: { kind: "registered", locator: "@narratage/media-track/render", digest: mediaTrackImplementationDigests.render } },
  ],
};
export const mediaTrackManifestDigest = digestOf(mediaTrackManifest);
export const mediaTrackDependency = { module: mediaTrackModuleRef, digest: mediaTrackManifestDigest } as const;
