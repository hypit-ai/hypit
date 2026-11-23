import type { MediaResource, MediaSourcePreviewBlock, MediaSourcePreviewRequest, MediaStoryboardAtlas, MediaViewRequest, ResolvedMedia } from "@hypit/media";

export type ProjectMediaViewRequest = (MediaViewRequest | MediaSourcePreviewRequest) & {
  readonly media: string;
  readonly expectedMediaGeneration: number;
};

export type ProjectMediaPreviewResource = MediaSourcePreviewBlock & { readonly resource?: string };

export type ProjectMediaViewResult =
  | { readonly resource: string; readonly mediaType: string; readonly atlas?: MediaStoryboardAtlas; readonly blocks?: never }
  | { readonly blocks: readonly ProjectMediaPreviewResource[]; readonly resource?: never; readonly mediaType?: never; readonly atlas?: never };

export type ProjectMediaViewObservation = {
  readonly handle: string;
  readonly kind: ProjectMediaViewRequest["kind"];
  readonly progress: number;
} & (
  | { readonly state: "queued" | "running" | "cancelled" }
  | { readonly state: "failed"; readonly diagnostic: string }
  | { readonly state: "complete"; readonly result: ProjectMediaViewResult }
);

export type ProjectMediaViewExecutor = {
  render(media: ResolvedMedia, request: MediaViewRequest, signal: AbortSignal): Promise<{
    readonly bytes: Uint8Array;
    readonly mediaType: "image/png" | "audio/wav";
    readonly atlas?: MediaStoryboardAtlas;
  }>;
  sourcePreview(media: ResolvedMedia, request: MediaSourcePreviewRequest, signal: AbortSignal): Promise<
    readonly (MediaSourcePreviewBlock & { readonly bytes?: Uint8Array })[]>;
  close(): Promise<void>;
};

export type ProjectMediaViewLease = {
  start(request: ProjectMediaViewRequest): Promise<ProjectMediaViewObservation>;
  observe(handle: string): ProjectMediaViewObservation | undefined;
  resource(token: string): MediaResource | undefined;
  cancel(handle: string): ProjectMediaViewObservation | undefined;
  close(): void;
};

export type ProjectMediaViews = {
  lease(publish?: (state: ProjectMediaViewObservation) => void): ProjectMediaViewLease;
  close(): Promise<void>;
};
