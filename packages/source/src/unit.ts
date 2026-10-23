import type { BlobRef } from "@hypit/protocol";

/** Half-open offsets in the representation decoded by one Source Frontend. */
export type SourceRange = {
  readonly start: number;
  readonly end: number;
};

export type SourceUnit = {
  /** Workspace-canonical identity used only for recursion and diagnostics. */
  readonly id: string;
  readonly name: string;
  /** Opaque source payload. Its selected Frontend alone decides how to decode it. */
  readonly bytes: Uint8Array;
};

/** A Workspace resolution. The Frontend choice is explicit and never guessed by the compiler. */
export type ResolvedSource = {
  readonly unit: SourceUnit;
  readonly frontend: string;
};

export type SourceImportRequest = {
  readonly from: string;
  readonly alias: string;
  readonly range?: SourceRange;
};

export type SourceAssetRequest = {
  readonly from: string;
  readonly mediaType: string;
  /** Package-owned bytes handed to the Workspace for identity and attachment ownership. */
  readonly bytes?: Uint8Array;
  readonly range?: SourceRange;
};

export type Awaitable<T> = T | Promise<T>;

export type SourceResolver = (
  importer: SourceUnit,
  request: SourceImportRequest,
) => Awaitable<ResolvedSource>;

export type SourceAssetResolver = (
  importer: SourceUnit,
  request: SourceAssetRequest,
) => Awaitable<BlobRef>;

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Explicit adapter for textual Frontends; Source itself remains byte-oriented. */
export function decodeSourceText(source: SourceUnit): string {
  return utf8.decode(source.bytes);
}
