import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import type { MediaResource, ResolvedMedia } from "@hypit/media";
import type { MediaAssetDocument, MediaAssetFileResolution, MediaAssetReference } from "../index.js";

export type ProjectMediaResourceResolver = (
  path: string,
  mediaType: string,
  resolution: MediaAssetFileResolution,
) => MediaResource | Promise<MediaResource>;

export type ProjectMediaCatalogPicture = {
  readonly kind: "constant" | "signal";
  readonly version?: string;
  readonly displayAspectRatio: number;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly rotationDegrees: 0 | 90 | 180 | 270;
};

export type ProjectMediaCatalogEntry =
  | {
      readonly state: "available" | "missing";
      readonly reference: MediaAssetReference;
      readonly mediaType: string;
      readonly adoptedAt: string;
      readonly displayName?: string;
      readonly fileExtension?: string;
      readonly duration?: ExactTemporalValue;
      readonly picture?: ProjectMediaCatalogPicture;
      readonly audio: boolean;
      readonly audioVersion?: string;
      readonly diagnostic?: string;
    }
  | {
      readonly state: "invalid";
      readonly reference: MediaAssetReference;
      readonly diagnostic: string;
    };

export type ProjectMediaCatalog = {
  /** Process-local generation of this open collection. */
  readonly generation: number;
  readonly entries: readonly ProjectMediaCatalogEntry[];
};

export type ProjectMediaCollectionAdapter = {
  scan(): Promise<readonly ProjectMediaCatalogEntry[]>;
  readLibrary(): Promise<{ readonly revision: string; readonly source?: string }>;
  writeLibrary(source: string, expectedRevision: string): Promise<string>;
  open(reference: MediaAssetReference): Promise<MediaAssetDocument>;
  renameAsset(reference: MediaAssetReference, displayName: string): Promise<boolean>;
  stageAssetRemoval(reference: MediaAssetReference): Promise<{
    restore(): Promise<void>;
    discard(): Promise<void>;
  } | undefined>;
  resolveMedia(reference: MediaAssetReference, resolver: ProjectMediaResourceResolver): Promise<ResolvedMedia>;
};

export type ProjectMediaServiceListener = (catalog: ProjectMediaCatalog) => void;
