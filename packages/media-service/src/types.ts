import type { MediaRepresentationDeclaration } from "@hypit/media-asset";
import type { ProjectObjectRef } from "@hypit/project";

export const projectMediaCatalogFormat = "hypit.media-service-catalog@1";

export type ProjectMediaKind = "image" | "video" | "audio" | "unknown";

/** Rebuildable observation of one Media Asset manifest in the Project media namespace. */
export type ProjectMediaAssetView = {
  readonly ref: ProjectObjectRef;
  /** Opaque Host observation revision for optimistic commands; not document history. */
  readonly revision?: string;
  /** Opaque primary-resource observation identity for stale resource request rejection. */
  readonly resourceRevision?: string;
  readonly name: string;
  readonly kind: ProjectMediaKind;
  readonly mediaType?: string;
  readonly size?: number;
  readonly durationSeconds?: number;
  readonly width?: number;
  readonly height?: number;
  readonly hasAudio?: boolean;
  readonly resourceAvailable: boolean;
  readonly error?: string;
};

/** One atomic Catalog snapshot. Its generation is invocation-local cache identity, not an author revision. */
export type ProjectMediaCatalogView = {
  readonly format: typeof projectMediaCatalogFormat;
  readonly generation: number;
  readonly assets: readonly ProjectMediaAssetView[];
};

export type ProjectMediaService = {
  readonly projectRoot: string;
  readonly generation: number | undefined;
  observe(): Promise<ProjectMediaCatalogView>;
  refresh(): Promise<ProjectMediaCatalogView>;
  /** Subscribe to complete Catalog publications. Subscribe before observe() to avoid an observation race. */
  subscribe(listener: (generation: number) => void): () => void;
  close(): Promise<void>;
};

/** Already accepted declaration only; candidate production and package validation happen before this command. */
type ProjectMediaRepresentationCommandBase = {
  readonly asset: ProjectObjectRef;
  readonly assetRevision: string;
};

export type ProjectMediaRepresentationCommand = ProjectMediaRepresentationCommandBase & (
  | {
      readonly kind: "representation.attach";
      readonly representation: MediaRepresentationDeclaration;
    }
  | {
      readonly kind: "representation.replace";
      readonly id: string;
      readonly representation: MediaRepresentationDeclaration;
    }
  | {
      readonly kind: "representation.detach";
      readonly id: string;
    }
);

export type ProjectMediaRepresentationReceipt = {
  readonly format: "hypit.media-service-representation-receipt@1";
  readonly asset: ProjectObjectRef;
  readonly assetRevision: string;
  readonly representation: string;
  readonly catalogGeneration: number;
};
