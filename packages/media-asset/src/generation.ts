import type { GenerationValueNodeDeclaration } from "@hypit/generation-graph";
import {
  mediaDependency,
  mediaTypes,
} from "@hypit/media";
import type { CanonicalValue, ModuleManifest } from "@hypit/protocol";

import {
  parseMediaAssetDocument,
  resolveMediaAssetMedia,
  verifyMediaAssetReference,
} from "./document.js";
import type { MediaAssetReference } from "./types.js";

export const mediaAssetModuleRef = { name: "@hypit/media-asset", version: "1" } as const;

export const mediaAssetManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: mediaAssetModuleRef.name,
  version: mediaAssetModuleRef.version,
  dependencies: [mediaDependency],
  types: [],
  capabilities: [],
  producers: [],
};

export const mediaAssetGenerationNodes = {
  media: { module: mediaAssetModuleRef, name: "media" },
} as const;

function fileLocator(reference: MediaAssetReference, file: string): string {
  const manifest = reference.path.startsWith("./") ? reference.path.slice(2) : reference.path;
  const parts = manifest.split("/");
  parts.pop();
  return `./${[...parts, file.startsWith("./") ? file.slice(2) : file].join("/")}`;
}

function referenceLocator(reference: MediaAssetReference): string {
  return reference.path.startsWith("./") ? reference.path : `./${reference.path}`;
}

/** A persistent Media Asset becomes one authored PreparedMedia value before Build execution. */
export const mediaAssetGenerationNode: GenerationValueNodeDeclaration = {
  kind: "value",
  using: mediaAssetGenerationNodes.media,
  inputs: ["asset"],
  type: mediaTypes.prepared,
  async load({ inputs, readAsset, resolveAsset }) {
    const reference = inputs.asset as unknown as MediaAssetReference;
    verifyMediaAssetReference(reference);
    const bytes = await readAsset({ from: referenceLocator(reference), mediaType: "application/json" });
    const document = parseMediaAssetDocument(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return await resolveMediaAssetMedia(document, async (file) => await resolveAsset({
      from: fileLocator(reference, file.path),
      mediaType: file.mediaType,
    })) as unknown as CanonicalValue;
  },
};
