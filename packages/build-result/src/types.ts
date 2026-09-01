import type {
  BlobRef,
  BuildState,
  TypeRef,
} from "@hypit/protocol";

export type BuildResultStatus = "running" | "complete" | "failed" | "cancelled";

export type BuildResultFileRef = {
  readonly kind: "build-file";
  /** Omitted for this Build; present for a directly carried historical file. */
  readonly build?: string;
  /** Forward-only path relative to the owning Build's result directory. */
  readonly path: string;
  readonly size: number;
  readonly mediaType: string;
};

export type HistoricalBuildOutputRef = {
  readonly kind: "build-output";
  readonly build: string;
  readonly output: string;
};

export type BuildResultJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly BuildResultJsonValue[]
  | BuildResultFileRef
  | HistoricalBuildOutputRef
  | { readonly [key: string]: BuildResultJsonValue };

export type BuildResultOutputValue =
  | BuildResultFileRef
  | HistoricalBuildOutputRef
  | { readonly kind: "inline"; readonly value: null | boolean | number | string }
  | { readonly kind: "json"; readonly path: string };

export type BuildResultOutput = {
  readonly type: TypeRef;
  readonly value: BuildResultOutputValue;
};

export type BuildResultManifest = {
  readonly format: "hypit.build-result@1";
  readonly id: string;
  readonly name?: string;
  readonly source: { readonly path: string };
  readonly run?: { readonly path: string };
  /** Author-facing names of the Build's actual final goals. */
  readonly targets: readonly string[];
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly finishedAt?: number;
  readonly status: BuildResultStatus;
  readonly failure?: string;
  readonly outputs: Readonly<Record<string, BuildResultOutput>>;
};

export type BuildResultAlias = {
  readonly name: string;
  readonly output: string;
};

export type BuildResultReuse = {
  /** Resolved Candidate id stored in the Build Plan. */
  readonly candidate: string;
  readonly build: string;
  readonly output: string;
};

export type BuildResultSeed = {
  readonly id: string;
  readonly name?: string;
  readonly source: { readonly path: string };
  readonly run?: { readonly path: string };
  readonly targets: readonly string[];
  readonly aliases: readonly BuildResultAlias[];
  readonly reuses?: readonly BuildResultReuse[];
  readonly startedAt?: number;
};

export type BuildResultArtifactSource = {
  open(artifact: BlobRef): Promise<AsyncIterable<Uint8Array> | undefined>;
};

export type BuildResultSync = {
  readonly state: BuildState;
  readonly artifacts: BuildResultArtifactSource;
};

export type BuildResultFinish = {
  readonly status: Exclude<BuildResultStatus, "running">;
  readonly failure?: string;
};

export type ResolvedBuildResultOutput = {
  readonly build: string;
  readonly output: string;
  readonly directory: string;
  readonly type: TypeRef;
  readonly value:
    | BuildResultFileRef
    | { readonly kind: "inline"; readonly value: null | boolean | number | string }
    | { readonly kind: "json"; readonly path: string; readonly value: BuildResultJsonValue };
};
