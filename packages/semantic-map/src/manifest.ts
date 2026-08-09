import { narrativeDependency } from "@narratage/narrative";
import { programSpaceDependency } from "@narratage/program-space";
import { speechEvidenceDependency } from "@narratage/speech-evidence";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, TypeRef, ValueSchema } from "@narratage/protocol";
const string = { kind: "string", minLength: 1 } as const; const number = { kind: "number", minimum: 0 } as const; const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const timedSegment = object({ segmentId: { schema: string }, startSec: { schema: number }, endSec: { schema: number }, startFrame: { schema: integer }, endFrame: { schema: integer } });
const timedToken = object({ tokenId: { schema: string }, segmentId: { schema: string }, startSec: { schema: number }, endSec: { schema: number }, startFrame: { schema: integer }, endFrame: { schema: integer } });
const point = object({ identity: { schema: string }, timeSec: { schema: number }, frame: { schema: integer } });
export const completeSemanticMapSchema: ValueSchema = object({ contract: { schema: { kind: "literal", value: "svml.complete-semantic-map@1" } },
  tokens: { schema: { kind: "array", items: timedToken } }, anchors: { schema: { kind: "array", items: point } } });
export const semanticMapModuleRef = { name: "@narratage/semantic-map", version: "1" } as const;
export const semanticMapTypes = { complete: { module: semanticMapModuleRef, name: "CompleteSemanticMap" } } satisfies Record<string, TypeRef>;
export const semanticMapManifest: ModuleManifest = { format: "svml.module@1", name: semanticMapModuleRef.name, version: semanticMapModuleRef.version,
  dependencies: [narrativeDependency, speechEvidenceDependency, programSpaceDependency], types: [{ name: semanticMapTypes.complete.name, schema: completeSemanticMapSchema }], capabilities: [], surfaces: [], producers: [] };
export const semanticMapManifestDigest = digestOf(semanticMapManifest);
export const semanticMapDependency = { module: semanticMapModuleRef, digest: semanticMapManifestDigest } as const;
