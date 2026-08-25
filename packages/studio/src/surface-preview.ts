import type { SurfacePreview } from "@hypit/markup";

import type { StudioDomain } from "./domain.js";
import type { StudioMaterialPreview } from "./shared.js";

function kindOf(mediaType: string): StudioMaterialPreview["kind"] | undefined {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType.startsWith("audio/")) return "audio";
  return undefined;
}

export function findSurfacePreview(
  domain: StudioDomain,
  module: { readonly name: string; readonly version: string },
  surface: string,
): SurfacePreview | undefined {
  return domain.surfaces.resolve(module, surface)?.vocabulary?.preview;
}

/** A selected package resource descriptor; transport remains Studio-owned. */
export function studioSurfacePreview(
  domain: StudioDomain,
  module: { readonly name: string; readonly version: string },
  surface: string,
): StudioMaterialPreview | undefined {
  const preview = findSurfacePreview(domain, module, surface);
  if (preview === undefined) return undefined;
  const kind = kindOf(preview.mediaType);
  if (kind === undefined) return undefined;
  return {
    kind,
    source: { kind: "surface-preview", module: module.name, version: module.version, surface },
  };
}
