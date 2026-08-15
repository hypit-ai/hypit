import { isDigest } from "@narratage/protocol";
import type { BlobRef, Digest, SourceRange } from "@narratage/protocol";

export type SourceUnit = {
  /** Host-canonical identity used only for recursion and diagnostics. */
  readonly id: string;
  readonly name: string;
  readonly text: string;
};

/** Shared identity fields of any successfully decoded self-described Source. */
export type CompiledSourceIdentity = {
  readonly frontend: string;
  readonly sourceDigest: Digest;
  readonly semanticDigest: Digest;
};

export function compiledSourceIdentity(value: CompiledSourceIdentity): CompiledSourceIdentity {
  return {
    frontend: value.frontend,
    sourceDigest: value.sourceDigest,
    semanticDigest: value.semanticDigest,
  };
}

export function verifyCompiledSourceIdentity(value: CompiledSourceIdentity): void {
  if (value.frontend.trim().length === 0) throw new Error("Source Frontend is empty");
  if (!isDigest(value.sourceDigest)) throw new Error("Source digest is invalid");
  if (!isDigest(value.semanticDigest)) throw new Error("Source semantic digest is invalid");
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
