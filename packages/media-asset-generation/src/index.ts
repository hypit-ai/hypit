import { blobDependency, blobTypes } from "@hypit/blob";
import type { GenerationValueNodeDeclaration } from "@hypit/generation-graph";
import { mediaDependency, mediaTypes } from "@hypit/media";
import {
  parseMediaAssetDocument,
  resolveMediaAssetMedia,
  verifyMediaAssetReference,
  type MediaAssetReference,
} from "@hypit/media-asset";
import type { CanonicalValue, ModuleManifest } from "@hypit/protocol";

export const mediaAssetGenerationModuleRef = {
  name: "@hypit/media-asset-generation",
  version: "1",
} as const;

export const mediaAssetGenerationManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: mediaAssetGenerationModuleRef.name,
  version: mediaAssetGenerationModuleRef.version,
  dependencies: [blobDependency, mediaDependency],
  types: [],
  capabilities: [],
  producers: [],
};

export const mediaAssetGenerationNodes = {
  media: { module: mediaAssetGenerationModuleRef, name: "media" },
  resource: { module: mediaAssetGenerationModuleRef, name: "resource" },
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

export const mediaAssetResourceGenerationNode: GenerationValueNodeDeclaration = {
  kind: "value",
  using: mediaAssetGenerationNodes.resource,
  inputs: ["asset"],
  type: blobTypes.blob,
  async load({ inputs, readAsset, resolveAsset }) {
    const reference = inputs.asset as unknown as MediaAssetReference;
    verifyMediaAssetReference(reference);
    const bytes = await readAsset({ from: referenceLocator(reference), mediaType: "application/json" });
    const document = parseMediaAssetDocument(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return await resolveAsset({
      from: fileLocator(reference, document.media.file.path),
      mediaType: document.media.file.mediaType,
    }) as unknown as CanonicalValue;
  },
};
