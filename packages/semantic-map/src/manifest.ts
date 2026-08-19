import { narrativeDependency } from "@hypit/narrative";
import { speechEvidenceDependency } from "@hypit/speech-evidence";
import type { ModuleManifest, TypeRef, ValueSchema } from "@hypit/protocol";
const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const timedToken = object({ tokenId: { schema: string }, segmentId: { schema: string }, startFrame: { schema: integer }, endFrameExclusive: { schema: integer } });
const point = object({ identity: { schema: string }, frame: { schema: integer } });
export const completeSemanticMapSchema: ValueSchema = object({
  tokens: { schema: { kind: "array", items: timedToken } }, anchors: { schema: { kind: "array", items: point } } });
export const semanticMapModuleRef = { name: "@hypit/semantic-map", version: "1" } as const;
export const semanticMapTypes = { complete: { module: semanticMapModuleRef, name: "CompleteSemanticMap" } } satisfies Record<string, TypeRef>;
export const semanticMapManifest: ModuleManifest = { format: "hypit.module@1", name: semanticMapModuleRef.name, version: semanticMapModuleRef.version,
  dependencies: [narrativeDependency, speechEvidenceDependency], types: [{ name: semanticMapTypes.complete.name }], capabilities: [], producers: [] };
export const semanticMapDependency = { module: semanticMapModuleRef } as const;
