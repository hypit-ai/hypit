import type { StudioMaterialPreview } from "./shared.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";

export type DeclarationPreview = {
  readonly mediaType: string;
  readonly path: string;
  readonly open: () => Promise<Uint8Array>;
};

function kindOf(mediaType: string): StudioMaterialPreview["kind"] | undefined {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType.startsWith("audio/")) return "audio";
  return undefined;
}

export function findDeclarationPreview(
  registry: StudioCompanionRegistry,
  module: { readonly name: string; readonly version: string },
  declaration: string,
): DeclarationPreview | undefined {
  return registry.declarationPreview(module, declaration);
}

/** A selected package resource descriptor; transport remains Studio-owned. */
export function studioDeclarationPreview(
  registry: StudioCompanionRegistry,
  module: { readonly name: string; readonly version: string },
  declaration: string,
): StudioMaterialPreview | undefined {
  const preview = findDeclarationPreview(registry, module, declaration);
  if (preview === undefined) return undefined;
  const kind = kindOf(preview.mediaType);
  if (kind === undefined) return undefined;
  return {
    kind,
    source: { kind: "declaration-preview", module: module.name, version: module.version, declaration },
  };
}
