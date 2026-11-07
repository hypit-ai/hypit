import type { PreparedMedia } from "@hypit/media";
import type { BlobRef, TypeRef } from "@hypit/protocol";
import type { TemporalMap } from "@hypit/temporal/algebra";

/** One portable file address, resolved relative to the Media Asset document. */
export type MediaAssetFile = {
  readonly path: string;
  readonly mediaType: string;
};

/** PreparedMedia facts whose byte source remains a file until a Host loads the document. */
export type PreparedMediaFileValue = Omit<PreparedMedia, "source">;

export type MediaRepresentationBinding = {
  /** Representation-local target time to PreparedMedia-local source time. */
  readonly temporal?: {
    readonly mapToMedia: TemporalMap;
  };
  /** Coordinates are normalized after PreparedMedia display interpretation. */
  readonly picture?: {
    readonly member: "picture";
    readonly space: "prepared-display-normalized";
  };
  /** The representation describes the selected PreparedMedia audio member. */
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

/** Portable authority for one prepared file plus independently owned representations. */
export type MediaAssetDocument = {
  readonly format: "hypit.media-asset@1";
  readonly id: string;
  readonly media: {
    readonly file: MediaAssetFile;
    readonly prepared: PreparedMediaFileValue;
  };
  readonly representations: readonly MediaRepresentationDeclaration[];
};

export type PreparedMediaRepresentation = Omit<MediaRepresentationDeclaration, "document" | "resources"> & {
  readonly document: BlobRef;
  readonly resources: Readonly<Record<string, BlobRef>>;
};

/** Ephemeral, validated projection of a MediaAssetDocument into Host byte resources. */
export type PreparedMediaAsset = {
  readonly id: string;
  readonly media: PreparedMedia;
  readonly representations: readonly PreparedMediaRepresentation[];
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
