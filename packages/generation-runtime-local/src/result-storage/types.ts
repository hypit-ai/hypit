import { assertOrderedBuildId } from "@hypit/generation-build";
import type { BlobRef } from "@hypit/protocol";
import type { TypeRef } from "@hypit/module";
import type { PublicationIntent, TypedRecord } from "@hypit/generation-build";
import { assertPublicationIntent } from "@hypit/generation-build";
import type {
  Product,
} from "@hypit/product";
import type { BuildResultOperation } from "@hypit/result";

export type BuildResultFileRef = {
  readonly kind: "build-file";
  readonly size: number;
  readonly mediaType: string;
  /** Path relative to the containing Result directory. */
  readonly path: string;
};

/** One portable address inside a Build Result; repositories map it to their own physical storage. */
export function assertBuildResultPath(value: unknown, subject: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")
    || value.includes("\\") || value.includes("\0")
    || value.split("/").some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`${subject} is not a Result-relative path`);
  }
}

export function assertBuildResultFileRef(value: unknown, subject: string): asserts value is BuildResultFileRef {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${subject} is not a Build file reference`);
  }
  const item = value as Readonly<Record<string, unknown>>;
  if (item.kind !== "build-file"
    || typeof item.size !== "number" || !Number.isSafeInteger(item.size) || item.size < 0
    || typeof item.mediaType !== "string" || item.mediaType.length === 0) {
    throw new Error(`${subject} is not a valid Build file reference`);
  }
  assertBuildResultPath(item.path, `${subject}.path`);
}

export type StoredBuildResultOutput = Product;

type StoredBuildResultBase = {
  readonly format: "hypit.build-result@1";
  /** Injected from the Repository address; `result.json` does not repeat its containing Build id. */
  readonly id: string;
  /** Author Source path recorded when the Build was submitted. */
  readonly sourcePath: string;
  /** Author-facing names of the Build's actual final goals. */
  readonly targets: readonly string[];
  readonly outputs: Readonly<Record<string, StoredBuildResultOutput>>;
};

/** Private writable state while Runtime is still materializing publications. */
export type BuildResultDraft = StoredBuildResultBase & {
  readonly outcome?: never;
  readonly finishedAt?: never;
  readonly failure?: never;
  readonly operations?: never;
  readonly executionLog?: never;
};

type StoredBuildResultEvidence = {
  readonly operations?: readonly BuildResultOperation[];
  readonly executionLog?: BuildResultFileRef;
};

/** Finished storage manifest used only by Runtime publication and Repository decoding. */
export type StoredFinishedBuildResult = StoredBuildResultBase & StoredBuildResultEvidence & (
  | { readonly outcome: "complete"; readonly finishedAt: number; readonly failure?: never }
  | { readonly outcome: "failed" | "cancelled"; readonly finishedAt: number; readonly failure: string }
);

/** Storage state used only by Runtime publication and recovery. */
export type StoredBuildResult = BuildResultDraft | StoredFinishedBuildResult;

export type BuildFinalizationSeed = {
  readonly id: string;
  readonly sourcePath: string;
  /** Author-facing names requested by this Build; targets are execution evidence, not publications. */
  readonly targets: readonly string[];
  readonly publication: PublicationIntent;
};

/** Validate the publication request before storage is touched. */
export function assertBuildFinalizationSeed(seed: BuildFinalizationSeed): void {
  if (seed.sourcePath.trim().length === 0) throw new Error("Build Source path must not be empty");
  const targets = new Set<string>();
  for (const target of seed.targets) {
    if (target.trim().length === 0) throw new Error("Build target must not be empty");
    if (targets.has(target)) throw new Error(`Build target ${target} is repeated`);
    targets.add(target);
  }
  assertPublicationIntent(seed.publication);
}

export type BuildFinalizationResourceSource = {
  open(blob: BlobRef): Promise<AsyncIterable<Uint8Array> | undefined>;
};

export type BuildFinalizationSync = {
  /** Already accepted Records; Result does not observe Runtime lifecycle or scheduling state. */
  readonly records: readonly TypedRecord[];
  readonly resources: BuildFinalizationResourceSource;
};

type BuildFinalizationFinishEvidence = {
  /** Closed execution evidence; Repository stores it before publishing the terminal manifest. */
  readonly executionLog?: AsyncIterable<Uint8Array>;
  readonly operations?: readonly BuildResultOperation[];
};

export type BuildFinalizationFinish = BuildFinalizationFinishEvidence & (
  | { readonly outcome: "complete"; readonly failure?: never }
  | { readonly outcome: "failed" | "cancelled"; readonly failure: string }
);

export type BuildFinalizer = {
  read(): Promise<StoredBuildResult>;
  /** Store newly completed publications; no storage writes when none are new. */
  sync(input: BuildFinalizationSync): Promise<StoredBuildResult>;
  finish(input: BuildFinalizationFinish): Promise<StoredFinishedBuildResult>;
};

/** Runtime-owned publication and recovery port; it exposes neither history nor Product lookup. */
export type BuildFinalizationStore = {
  create(seed: BuildFinalizationSeed): Promise<BuildFinalizer>;
  openFinalizer(build: string): Promise<BuildFinalizer | undefined>;
  /** Remove one exact unfinished Result created by a submission that never became claimable. */
  removeIncomplete(build: string): Promise<void>;
  /** Read private publication state for active-build observation and crash recovery. */
  readStored(build: string): Promise<StoredBuildResult | undefined>;
};
