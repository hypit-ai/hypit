import { blobDependency, blobTypes } from "@hypit/blob";
import type { GenerationGraphNode, GenerationValueNodeDeclaration } from "@hypit/generation-graph";
import type { GenerationNodeAuthoringShape } from "@hypit/generation-graph";
import type { GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { mediaDependency, mediaTypes } from "@hypit/media";
import {
  parseMediaAssetDocument,
  resolveMediaAssetMedia,
  verifyMediaAssetReference,
  type MediaAssetReference,
} from "@hypit/media-asset";
import type { CanonicalValue } from "@hypit/protocol";
import type { GenerationModuleDefinition } from "@hypit/generation-build";

export const mediaAssetGenerationModuleRef = {
  name: "@hypit/media-asset-generation",
} as const;

export const mediaAssetGenerationManifest: GenerationModuleDefinition = {
  name: mediaAssetGenerationModuleRef.name,
  dependencies: [blobDependency, mediaDependency],
  types: [],
  capabilities: [],
  producers: [],
};

export const mediaAssetGenerationNodes = {
  media: { module: mediaAssetGenerationModuleRef, name: "media" },
  image: { module: mediaAssetGenerationModuleRef, name: "image" },
  video: { module: mediaAssetGenerationModuleRef, name: "video" },
  audio: { module: mediaAssetGenerationModuleRef, name: "audio" },
} as const;

export const mediaAssetGenerationPresentations: readonly GenerationCanvasNodePresentation[] = ([
  ["image", "Image Asset"], ["video", "Video Asset"], ["audio", "Audio Asset"],
] as const).map(([role, displayName]) => ({
  using: mediaAssetGenerationNodes[role], displayName, modelLabel: "Project Asset", role, category: "asset", summaryInput: "asset",
}));

const mediaAssetAuthoring: GenerationNodeAuthoringShape = {
  using: mediaAssetGenerationNodes.media,
  output: { type: mediaTypes.prepared, connectable: false },
  controls: [],
  ports: [],
};

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
  authoring: mediaAssetAuthoring,
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

function resourceNode(role: "image" | "video" | "audio"): GenerationValueNodeDeclaration {
  const using = mediaAssetGenerationNodes[role];
  return {
    kind: "value",
    using,
    inputs: ["asset"],
    type: blobTypes.blob,
    authoring: {
      using,
      output: { type: blobTypes.blob, connectable: true, media: [role] },
      controls: [],
      ports: [],
    },
    async load({ inputs, readAsset, resolveAsset }) {
      const reference = inputs.asset as unknown as MediaAssetReference;
      verifyMediaAssetReference(reference);
      const bytes = await readAsset({ from: referenceLocator(reference), mediaType: "application/json" });
      const document = parseMediaAssetDocument(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!document.media.file.mediaType.startsWith(`${role}/`)) {
        throw new Error(`${role} asset ${reference.path} resolves to ${document.media.file.mediaType}.`);
      }
      return await resolveAsset({
        from: fileLocator(reference, document.media.file.path),
        mediaType: document.media.file.mediaType,
      }) as unknown as CanonicalValue;
    },
  };
}

export const mediaAssetResourceGenerationNodes = {
  image: resourceNode("image"),
  video: resourceNode("video"),
  audio: resourceNode("audio"),
} as const;

/** Package-owned recipe node for one already published Media Asset. Hosts never guess component names. */
export function createMediaAssetGenerationGraphNode(input: {
  readonly id: string;
  readonly role: "image" | "video" | "audio";
  readonly asset: MediaAssetReference;
}): GenerationGraphNode {
  verifyMediaAssetReference(input.asset);
  return {
    id: input.id,
    using: mediaAssetGenerationNodes[input.role],
    inputs: { asset: { value: { path: input.asset.path } } },
  };
}
