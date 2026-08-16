import type { BlobRef, SourceRange } from "@narratage/protocol";

export type SourceUnit = {
  /** Host-canonical identity used only for recursion and diagnostics. */
  readonly id: string;
  readonly name: string;
  readonly text: string;
};

/** Shared identity fields of any successfully decoded self-described Source. */
export type CompiledSourceIdentity = {
  readonly frontend: string;
};

export function compiledSourceIdentity(value: CompiledSourceIdentity): CompiledSourceIdentity {
  return {
    frontend: value.frontend,
  };
}

export function verifyCompiledSourceIdentity(value: CompiledSourceIdentity): void {
  if (value.frontend.trim().length === 0) throw new Error("Source Frontend is empty");
}

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
