import type { BlobRef, SourceRange } from "@narratage/protocol";

export type SourceUnit = {
  /** Host-canonical identity used only for recursion and diagnostics. */
  readonly id: string;
  readonly name: string;
  readonly text: string;
};

export type SourceImportRequest = {
  readonly from: string;
  readonly alias: string;
  readonly range?: SourceRange;
};

export type SourceAssetRequest = {
  readonly from: string;
  readonly mediaType: string;
  /** Package-owned bytes admitted by the compiler before a Workspace is consulted. */
  readonly bytes?: Uint8Array;
  readonly range?: SourceRange;
};

export type ResolvedSourceAsset = {
  readonly artifact: BlobRef;
};

export type Awaitable<T> = T | Promise<T>;

export type SourceResolver = (
  importer: SourceUnit,
  request: SourceImportRequest,
) => Awaitable<SourceUnit>;

export type SourceAssetResolver = (
  importer: SourceUnit,
  request: SourceAssetRequest,
) => Awaitable<ResolvedSourceAsset>;
