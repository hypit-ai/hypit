import type { CanonicalValue, NeedId, TypeRef, Value } from "@hypit/protocol";

/** The one durable conclusion of a finished Build. Active execution belongs to Runtime. */
export type BuildResultOutcome = "complete" | "failed" | "cancelled";

/** A normalized half-open byte range within one published Resource. */
export type BuildResultFileRange = {
  readonly start: number;
  readonly endExclusive: number;
};

/** History projection of one published Output; storage paths remain Repository-private. */
export type BuildResultOutput = {
  readonly type: TypeRef;
  readonly publisher: string;
  readonly publicationParameters?: CanonicalValue;
} & (
  | { readonly representation: "inline"; readonly value: null | boolean | number | string;
      readonly mediaType?: never; readonly size?: never }
  | { readonly representation: "structured"; readonly value?: never;
      readonly mediaType?: never; readonly size?: never }
  | { readonly representation: "file"; readonly mediaType: string; readonly size: number }
);

type BuildResultOperationEvidence = {
  readonly request: NeedId;
  readonly endpoint: string;
  readonly receipt?: { readonly id: string; readonly url?: string };
};

/** Durable facts about one external operation attempted by this Build. */
export type BuildResultOperation = BuildResultOperationEvidence & (
  | { readonly outcome: "unsettled" | "complete"; readonly failure?: never; readonly cancellation?: never }
  | { readonly outcome: "failed"; readonly failure: { readonly code: string; readonly message: string };
      readonly cancellation?: never }
  | { readonly outcome: "cancelled"; readonly failure?: never; readonly cancellation: {
      readonly outcome: "confirmed" | "accepted" | "unsupported" | "too-late" | "failed";
      readonly message?: string;
    } }
);

type BuildResultBase = {
  readonly format: "hypit.build-result@1";
  readonly id: string;
  readonly sourcePath: string;
  readonly targets: readonly string[];
  readonly outputs: Readonly<Record<string, BuildResultOutput>>;
  readonly executionLog?: true;
  readonly operations?: readonly BuildResultOperation[];
};

/** Immutable objective history published only after the Build reaches one conclusion. */
export type BuildResult = BuildResultBase & (
  | { readonly outcome: "complete"; readonly finishedAt: number; readonly failure?: never }
  | { readonly outcome: "failed" | "cancelled"; readonly finishedAt: number; readonly failure: string }
);

/** Read one exact published Output name without inherited-object aliases. */
export function buildResultOutput(
  manifest: Pick<BuildResult, "outputs">,
  name: string,
): BuildResultOutput | undefined {
  return Object.hasOwn(manifest.outputs, name) ? manifest.outputs[name] : undefined;
}

export type BuildResultBrowseRequest = {
  /** Return Builds strictly older than this ordered Build id. */
  readonly before?: string;
  readonly limit: number;
};

export type BuildResultPage = {
  /** Newest first. */
  readonly results: readonly BuildResult[];
  /** Last scanned Build id when an older page may exist. */
  readonly next?: string;
};

/** One finished published Output resolved to ordinary domain data and only its owned Resources. */
export type ResolvedBuildResultOutput = {
  readonly type: TypeRef;
  readonly publisher: string;
  readonly publicationParameters?: CanonicalValue;
  readonly value: Value;
  openResource(
    blob: import("@hypit/protocol").BlobRef,
    range?: BuildResultFileRange,
  ): Promise<AsyncIterable<Uint8Array> | undefined>;
};

/** Immutable project history. Open Runtime drafts never cross this reader boundary. */
export type BuildResultHistory = {
  read(build: string): Promise<BuildResult | undefined>;
  browse(request: BuildResultBrowseRequest): Promise<BuildResultPage>;
  resolve(build: string, output: string): Promise<ResolvedBuildResultOutput | undefined>;
  openExecutionLog(build: string): Promise<AsyncIterable<Uint8Array> | undefined>;
};
