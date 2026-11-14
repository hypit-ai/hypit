import type { PreparedMedia } from "@hypit/media";
import type { MediaInspection, MediaSelectionRequest } from "@hypit/media";
import type { BlobRef } from "@hypit/protocol";
import type { TypeRef } from "@hypit/module";
import type { TemporalMap } from "@hypit/temporal/algebra";

export const mediaAssetDocumentFormat = "hypit.media-asset@1";

/** One portable file address, resolved relative to the Media Asset document. */
export type MediaAssetFile = {
  readonly path: string;
  readonly mediaType: string;
};

/** Stable interpretation facts whose byte source remains a file until a Host opens the asset. */
export type MediaInterpretation = Omit<PreparedMedia, "source">;

/** Runtime projection of one file-backed media interpretation. Never serialized. */
export type ResolvedMedia = PreparedMedia;

/** Portable reference to a Media Asset document, relative to the file containing the reference. */
export type MediaAssetReference = {
  readonly path: string;
};

export type MediaRepresentationBinding = {
  /** Representation-local target time to the media-local source time. */
  readonly temporal?: {
    readonly mapToMedia: TemporalMap;
  };
  /** Coordinates are normalized after the media display interpretation. */
  readonly picture?: {
    readonly member: "picture";
    readonly space: "media-display-normalized";
  };
  /** The representation describes the selected media audio member. */
  readonly audio?: {
    readonly member: "audio";
  };
};

/** Package-owned file representation attached through only common media-domain bindings. */
export type MediaRepresentationDeclaration = {
  readonly id: string;
  readonly type: TypeRef;
  readonly document: MediaAssetFile;
  /** Package-named dense or auxiliary files; their meaning stays outside Core. */
  readonly resources: Readonly<Record<string, MediaAssetFile>>;
  readonly binding: MediaRepresentationBinding;
};

/** Portable authority for one media file plus independently owned representations. */
export type MediaAssetDocument = {
  readonly format: typeof mediaAssetDocumentFormat;
  readonly id: string;
  readonly media: {
    readonly file: MediaAssetFile;
    readonly interpretation: MediaInterpretation;
  };
  readonly representations: readonly MediaRepresentationDeclaration[];
};

export type ResolvedMediaRepresentation = Omit<MediaRepresentationDeclaration, "document" | "resources"> & {
  readonly document: BlobRef;
  readonly resources: Readonly<Record<string, BlobRef>>;
};

/** Ephemeral, validated projection of a MediaAssetDocument into Host byte resources. */
export type ResolvedMediaAsset = {
  readonly id: string;
  readonly media: ResolvedMedia;
  readonly representations: readonly ResolvedMediaRepresentation[];
};

export type MediaAssetFileResolution =
  | { readonly kind: "media" }
  | {
      readonly kind: "representation";
      readonly representation: string;
      readonly type: TypeRef;
    }
  | {
      readonly kind: "representation-resource";
      readonly representation: string;
      readonly type: TypeRef;
      readonly resource: string;
    };

export type MediaAssetFileResolver = (
  file: MediaAssetFile,
  resolution: MediaAssetFileResolution,
) => BlobRef | Promise<BlobRef>;

export type MediaAssetImportProgress = {
  readonly stage: "inspect" | "interpret" | "copy" | "publish" | "complete";
  readonly source: string;
  readonly target?: string;
};

/** Invocation-local task controls. They are never serialized into an asset or NLE project. */
export type MediaAssetImportTaskContext = {
  readonly signal?: AbortSignal;
  readonly progress?: (update: MediaAssetImportProgress) => void;
};

export type MediaAssetInterpretationInput = {
  readonly id: string;
  readonly file: MediaAssetFile;
  readonly inspection: MediaInspection;
  readonly selection: MediaSelectionRequest;
};
