import type {
  MediaInspection,
  MediaInterpretation,
  MediaResource,
  MediaSelectionRequest,
  ResolvedMedia,
} from "@hypit/media";
import type { TemporalMap } from "@hypit/temporal/algebra";

export const mediaAssetDocumentFormat = "hypit.media-asset";

export type MediaAssetReference = {
  /** Project-relative path to the Media Asset manifest. */
  readonly path: string;
};

export type MediaAssetFile = {
  /** Portable path relative to the Media Asset manifest. */
  readonly path: string;
  readonly mediaType: string;
};

export type MediaRepresentationType = {
  readonly package: string;
  readonly name: string;
};

export type MediaRepresentationBinding = {
  readonly temporal?: { readonly mapToMedia: TemporalMap };
  readonly picture?: { readonly member: "picture"; readonly space: "media-display-normalized" };
  readonly audio?: { readonly member: "audio" };
};

export type MediaRepresentationDeclaration = {
  readonly id: string;
  readonly type: MediaRepresentationType;
  readonly document: MediaAssetFile;
  readonly resources: Readonly<Record<string, MediaAssetFile>>;
  readonly binding: MediaRepresentationBinding;
};

export type MediaAssetDocument = {
  readonly format: typeof mediaAssetDocumentFormat;
  readonly media: {
    readonly file: MediaAssetFile;
    readonly interpretation: MediaInterpretation;
  };
  readonly representations: readonly MediaRepresentationDeclaration[];
};

export type ResolvedMediaRepresentation = Omit<MediaRepresentationDeclaration, "document" | "resources"> & {
  readonly document: MediaResource;
  readonly resources: Readonly<Record<string, MediaResource>>;
};

export type ResolvedMediaAsset = {
  readonly media: ResolvedMedia;
  readonly representations: readonly ResolvedMediaRepresentation[];
};

export type MediaAssetFileResolution =
  | { readonly kind: "media" }
  | { readonly kind: "representation"; readonly representation: string; readonly type: MediaRepresentationType }
  | {
      readonly kind: "representation-resource";
      readonly representation: string;
      readonly type: MediaRepresentationType;
      readonly resource: string;
    };

export type MediaAssetFileResolver = (
  file: MediaAssetFile,
  resolution: MediaAssetFileResolution,
) => MediaResource | Promise<MediaResource>;

export type MediaAdoptionProgress = {
  readonly stage: "inspect" | "interpret" | "copy" | "publish" | "complete";
  readonly source: string;
  readonly target?: string;
};

export type MediaAdoptionContext = {
  readonly signal?: AbortSignal;
  readonly progress?: (update: MediaAdoptionProgress) => void;
};

export type MediaAssetInterpretationInput = {
  readonly file: MediaAssetFile;
  readonly inspection: MediaInspection;
  readonly selection: MediaSelectionRequest;
};
